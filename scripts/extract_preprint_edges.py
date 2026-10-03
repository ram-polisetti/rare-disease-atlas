#!/usr/bin/env python3
"""Batch 6 extraction: preprints (extract_batch_6.jsonl) -> llm_edges_batch_6.json.

v2 grounding contract:
  - every claim needs a VERBATIM source_quote (substring of title+abstract,
    whitespace-normalized, case-insensitive). No paraphrase, no fuzzy loophole.
  - subject and object labels must appear (case-insensitive) in the text
    (dash/space variants allowed; GBA == GBA1).
  - relations restricted to the brief's small vocabulary.
  - confidence: high only if subject+object both inside the quoted span;
    else medium; never low.
  - dedupe identical (subject, relation, object) within the batch.
  - 0-6 claims per record, aim 1-3.
Output: data/processed/llm_edges_batch_6.json (JSON array).
"""
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

BASE = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas")
IN = os.path.join(BASE, "data/processed/extract_batch_6.jsonl")
OUT = os.path.join(BASE, "data/processed/llm_edges_batch_6.json")
CHECKPOINT = os.path.join(BASE, "data/processed/extract_batch_6_checkpoint.jsonl")
OLLAMA = os.path.expanduser("~/workspace/skills/ollama/bin/ollama_cloud.py")

MODEL_ORDER = ["gpt-oss:120b", "mistral-large-3:675b", "deepseek-v4-pro:0813"]

RELATIONS = ("caused_by_variant_in", "treated_by", "studied_in", "associated_with",
             "presents_with", "encodes", "disrupts", "accumulates_in")

PROMPT = (
    "You extract evidence-backed biomedical claims from a scientific abstract. "
    "Reply ONLY as compact JSON, no markdown, no other text. "
    "Copy every claim's quote VERBATIM from the abstract title/text: an exact "
    "substring, not a paraphrase, not a stitched fragment. "
    "Only claims about: gene->variant->mechanism; disease->phenotype/symptom; "
    "drug/treatment->disease (what was studied, NOT approval status); "
    "gene->disease association. Subject and object must be named verbatim in the "
    "text. Use ONLY these relations: "
    + ",".join(RELATIONS) + ". "
    "Keep at most 6 claims, aim 1-3. "
    'Format: {"claims":[{"subject":"","relation":"","object":"",'
    '"source_quote":"","contradicts":false}]}. '
    "Record: "
)


def call_model(prompt, model, timeout=180):
    try:
        out = subprocess.run(
            [sys.executable, OLLAMA, "chat", "--model", model, "--prompt", prompt,
             "--temperature", "0.1", "--max-tokens", "1200",
             "--timeout", str(timeout)],
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
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def label_in_text(label, hay):
    lab = label.strip().lower()
    if not lab:
        return False
    cands = {lab, lab.replace("-", " "), lab.replace(" ", ""),
             lab.replace("-", ""), lab.replace(" ", "-")}
    if lab == "gba":
        cands.add("gba1")
    if lab == "gba1":
        cands.add("gba")
    return any(c in hay for c in cands if c)


def verify_claims(rec, parsed):
    text = ((rec.get("title") or "") + " " + (rec.get("abstract") or "")).strip()
    hay = norm(text)
    claims = []
    stats = {"kept": 0, "dropped": 0}
    for c in (parsed.get("claims") or []):
        s = str(c.get("subject", "")).strip()
        r = str(c.get("relation", "")).strip()
        o = str(c.get("object", "")).strip()
        q = str(c.get("source_quote", "") or c.get("quote", "")).strip()
        if not (s and r and o):
            stats["dropped"] += 1
            continue
        if r not in RELATIONS:
            stats["dropped"] += 1
            continue
        if not q or len(norm(q)) < 8:
            stats["dropped"] += 1
            continue
        if norm(q) not in hay:          # v2: strict verbatim, no fuzzy
            stats["dropped"] += 1
            continue
        if not label_in_text(s, hay) or not label_in_text(o, hay):
            stats["dropped"] += 1
            continue
        qn = norm(q)
        conf = "high" if (norm(s) in qn and norm(o) in qn) else "medium"
        claims.append({"subject": s, "relation": r, "object": o,
                       "pmid": rec.get("pmid"), "source_quote": q,
                       "confidence": conf,
                       "contradicts": bool(c.get("contradicts", False))})
        stats["kept"] += 1
    return claims, stats


def process_one(rec, ckpt_lock):
    prompt = PROMPT + (rec.get("title") or "") + "\n" + (rec.get("abstract") or "")
    parsed = None
    used = None
    auth_models = []
    for model in MODEL_ORDER:
        for _ in range(2):
            raw, kind = call_model(prompt, model)
            if kind == "auth":
                auth_models.append(model)
                break
            parsed = parse_json(raw)
            if parsed is not None:
                used = model
                break
        if used:
            break
    if not used and len(auth_models) == len(MODEL_ORDER):
        raise RuntimeError("AUTH_FAIL")
    if parsed is None:
        result = {"pmid": rec.get("pmid"), "claims": [], "skipped": True,
                  "extraction_model": None}
        stats = {"kept": 0, "dropped": 0}
    else:
        claims, stats = verify_claims(rec, parsed)
        result = {"pmid": rec.get("pmid"), "claims": claims, "skipped": False,
                  "extraction_model": used}
    with ckpt_lock:
        with open(CHECKPOINT, "a") as f:
            f.write(json.dumps(result) + "\n")
    return result, stats


def main():
    recs = [json.loads(l) for l in open(IN) if l.strip()]
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
    agg = {"processed": 0, "skipped": 0, "kept": 0, "dropped": 0}
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
            agg["kept"] += stats["kept"]
            agg["dropped"] += stats["dropped"]
            if i % 10 == 0:
                print(f"...{i}/{len(todo)} kept={agg['kept']} dropped={agg['dropped']}",
                      flush=True)
            time.sleep(0.5)
    # assemble output: dedupe identical (subject, relation, object) in batch
    seen, edges = set(), []
    ckpt = {}
    for l in open(CHECKPOINT):
        try:
            r = json.loads(l)
            ckpt[r["pmid"]] = r
        except Exception:
            pass
    for r in recs:
        for c in ckpt.get(r["pmid"], {}).get("claims", []):
            key = (norm(c["subject"]), c["relation"], norm(c["object"]))
            if key in seen:
                continue
            seen.add(key)
            edges.append(c)
    with open(OUT, "w") as f:
        json.dump(edges, f, indent=1)
    json.load(open(OUT))
    print("FINAL:", json.dumps(agg), "edges_written:", len(edges))


if __name__ == "__main__":
    main()
