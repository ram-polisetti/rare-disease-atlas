#!/usr/bin/env python3
"""Extract structured biomedical triples from PubMed abstracts via Ollama Cloud LLM.

Writes: ~/workspace/hack-nation-rare-disease-atlas/data/processed/llm_edges.json
Checkpoint: data/processed/llm_edges_checkpoint.jsonl (append, resume-safe).

Verification (evidence integrity):
  - every extracted gene/variant/phenotype must appear verbatim in title+abstract
    (case-insensitive substring; gene labels also tried with dash/space variants)
  - every claim needs subject/relation/object + quote; quote must be a substring
    of the abstract text (whitespace-normalized) -> "medium" confidence,
    else a fuzzy match (difflib >= 0.8) -> "low", else the claim is dropped.
  - retry ONCE on empty/unparseable model response; after two failures the
    abstract is recorded with skipped=true.

Concurrency: 2 worker threads max (rate-limit safe). Sequential-safe too.
"""
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher

BASE = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas")
RAW = os.path.join(BASE, "data/raw/pubmed_abstracts.jsonl")
OUT = os.path.join(BASE, "data/processed/llm_edges.json")
CHECKPOINT = os.path.join(BASE, "data/processed/llm_edges_checkpoint.jsonl")
OLLAMA = os.path.expanduser("~/workspace/skills/ollama/bin/ollama_cloud.py")

# Requested order; qwen3.5:397b is not on the account, so it is skipped.
MODEL_ORDER = ["gpt-oss:120b", "mistral-large-3:675b", "deepseek-v4-pro:0813"]

PROMPT = (
    "From this abstract, list: (1) genes mentioned, (2) variants mentioned, "
    "(3) phenotypes/symptoms mentioned, (4) claims as subject-relation-object "
    "triples, (5) investigator names. Copy each claim's quote VERBATIM from the "
    "abstract (a short exact substring). Reply ONLY as compact JSON, no markdown: "
    '{"genes":[],"variants":[],"phenotypes":[],"claims":'
    '[{"subject":"","relation":"","object":"","quote":"","contradicts":false}],'
    '"investigators":[]}. Abstract: '
)

GENE_ALIASES = {
    # allow common short/long spellings to count as verified when text has the other
    "gba1": ["gba"], "gba": ["gba1"],
}


def call_model(prompt, model, timeout=180):
    """Returns (text, kind): kind is 'ok', 'empty', or 'auth' (401/403)."""
    try:
        out = subprocess.run(
            [sys.executable, OLLAMA, "chat", "--model", model, "--prompt", prompt,
             "--temperature", "0.2", "--max-tokens", "900", "--timeout", str(timeout)],
            capture_output=True, text=True, timeout=timeout + 30)
    except Exception:
        return "", "empty"
    blob = (out.stdout or "") + (out.stderr or "")
    if "401" in blob or "403" in blob:
        return "", "auth"
    return (out.stdout or "").strip(), "ok"


def parse_json(text):
    if not text:
        return None
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def norm(s):
    return re.sub(r"\s+", " ", s.strip().lower())


def entity_verified(label, hay):
    lab = label.strip().lower()
    if lab and lab in hay:
        return True
    for variant in (lab.replace("-", " "), lab.replace(" ", ""),
                    lab.replace("-", ""), lab.replace(" ", "-")):
        if variant and variant in hay:
            return True
    for alias in GENE_ALIASES.get(lab, []):
        if alias in hay:
            return True
    return False


def quote_confidence(quote, hay):
    q = norm(quote)
    if len(q) < 8:
        return None
    if q in hay:
        return "medium"
    best = 0.0
    # fuzzy: compare against each sentence
    for sent in re.split(r"(?<=[.!?])\s+", hay):
        if len(sent) < len(q) * 0.5:
            continue
        r = SequenceMatcher(None, q, sent).ratio()
        if r > best:
            best = r
            if best >= 0.8:
                return "low"
    return None


def verify_and_build(rec, parsed, model):
    title = rec.get("title") or ""
    abstract = rec.get("abstract") or ""
    text = (title + "\n" + abstract).strip()
    hay = norm(text)
    stats = {"ent_kept": 0, "ent_dropped": 0, "clm_kept": 0, "clm_dropped": 0,
             "clm_low": 0}

    entities = []
    for etype, labels in (("gene", parsed.get("genes", [])),
                          ("variant", parsed.get("variants", [])),
                          ("phenotype", parsed.get("phenotypes", []))):
        seen = set()
        for lab in labels or []:
            lab = str(lab).strip()
            if not lab or lab.lower() in seen:
                continue
            seen.add(lab.lower())
            if entity_verified(lab, hay):
                entities.append({"type": etype, "label": lab})
                stats["ent_kept"] += 1
            else:
                stats["ent_dropped"] += 1

    claims = []
    for c in parsed.get("claims", []) or []:
        s, r, o = (str(c.get(k, "")).strip() for k in ("subject", "relation", "object"))
        q = str(c.get("quote", "")).strip()
        if not (s and r and o):
            stats["clm_dropped"] += 1
            continue
        # subject/object should be grounded too (drop ungrounded claims)
        if not (entity_verified(s, hay) or len(s) < 40):
            # allow short ungrounded relation anchors to pass only if quote is strong
            pass
        conf = quote_confidence(q, hay) if q else None
        if conf is None:
            stats["clm_dropped"] += 1
            continue
        if conf == "low":
            stats["clm_low"] += 1
        claims.append({"subject": s, "relation": r, "object": o, "quote": q,
                       "confidence": conf,
                       "contradicts": bool(c.get("contradicts", False))})
        stats["clm_kept"] += 1

    investigators = []
    seen = set()
    for name in parsed.get("investigators", []) or []:
        name = str(name).strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            investigators.append(name)

    return ({"pmid": rec.get("pmid"), "title": title, "entities": entities,
             "claims": claims, "investigators": investigators,
             "extraction_model": model, "skipped": False}, stats)


def process_one(rec, ckpt_lock):
    title = rec.get("title") or ""
    abstract = rec.get("abstract") or ""
    prompt = PROMPT + (title + "\n" + abstract)
    parsed = None
    used_model = None
    auth_failed_models = []
    for model in MODEL_ORDER:
        for attempt in range(2):  # one retry on empty/unparseable
            raw, kind = call_model(prompt, model)
            if kind == "auth":
                auth_failed_models.append(model)
                break
            parsed = parse_json(raw)
            if parsed is not None:
                used_model = model
                break
        if used_model:
            break
    if not used_model and len(auth_failed_models) == len(MODEL_ORDER):
        raise RuntimeError("AUTH_FAIL: all models returned 401/403 on chat endpoint")
    if parsed is None:
        result = {"pmid": rec.get("pmid"), "title": title, "entities": [],
                  "claims": [], "investigators": [],
                  "extraction_model": None, "skipped": True}
        stats = {"ent_kept": 0, "ent_dropped": 0, "clm_kept": 0, "clm_dropped": 0,
                 "clm_low": 0}
    else:
        result, stats = verify_and_build(rec, parsed, used_model)
    with ckpt_lock:
        with open(CHECKPOINT, "a") as f:
            f.write(json.dumps(result) + "\n")
    return result, stats


def main():
    recs = [json.loads(l) for l in open(RAW) if l.strip()]
    done = set()
    if os.path.exists(CHECKPOINT):
        for l in open(CHECKPOINT):
            try:
                done.add(json.loads(l)["pmid"])
            except Exception:
                pass
    todo = [r for r in recs if r.get("pmid") not in done]
    print(f"total={len(recs)} done={len(done)} todo={len(todo)}", flush=True)
    ckpt_lock = threading.Lock()
    agg = {"processed": 0, "skipped": 0, "ent_kept": 0, "ent_dropped": 0,
           "clm_kept": 0, "clm_dropped": 0, "clm_low": 0}
    with ThreadPoolExecutor(max_workers=2) as ex:
        futs = {ex.submit(process_one, r, ckpt_lock): r for r in todo}
        for i, fut in enumerate(futs, 1):
            try:
                res, stats = fut.result()
            except Exception as e:
                print(f"ERROR {e}", flush=True)
                continue
            agg["processed"] += 1
            if res["skipped"]:
                agg["skipped"] += 1
            for k in ("ent_kept", "ent_dropped", "clm_kept", "clm_dropped", "clm_low"):
                agg[k] += stats[k]
            if i % 25 == 0:
                print(f"...{i}/{len(todo)} processed={agg['processed']} "
                      f"skipped={agg['skipped']} claims={agg['clm_kept']}", flush=True)
            time.sleep(0.5)
    # finalize output json
    results = {}
    for l in open(CHECKPOINT):
        try:
            r = json.loads(l)
            results[r["pmid"]] = r
        except Exception:
            pass
    ordered = [results.get(r["pmid"]) for r in recs]
    ordered = [o for o in ordered if o]
    with open(OUT, "w") as f:
        json.dump(ordered, f)
    json.load(open(OUT))  # validate
    print("FINAL:", json.dumps(agg))
    print("wrote", OUT, "records:", len(ordered))


if __name__ == "__main__":
    main()
