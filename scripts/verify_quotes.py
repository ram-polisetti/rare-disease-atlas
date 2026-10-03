#!/usr/bin/env python3
"""Phase 2 grounded verification, stage 1 (programmatic, TOTAL coverage).

For every claim in the Codex extraction batches, checks that `source_quote`
(legacy alias: `quote`) string-matches the cited abstract, whitespace-normalized
and case-insensitive, and that subject/object labels appear in the abstract.
Failures are quarantined to data/processed/llm_edges_failed.json and NEVER
merged. Verified claims are concatenated to data/processed/llm_edges.json.

Usage: ~/workspace/.venv/bin/python scripts/verify_quotes.py
"""
import glob
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "data", "processed")


def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def load_abstracts():
    """pmid -> title + ' ' + abstract, from the batch input records."""
    texts = {}
    for path in sorted(glob.glob(os.path.join(PROC, "extract_batch_*.jsonl"))):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                texts[str(r.get("pmid", "")).strip()] = (
                    r.get("title") or "") + " " + (r.get("abstract") or "")
    # fallback: raw full dump
    raw = os.path.join(BASE, "data", "raw", "pubmed_abstracts.jsonl")
    if os.path.exists(raw):
        with open(raw) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                texts.setdefault(str(r.get("pmid", "")).strip(),
                                 (r.get("title") or "") + " " + (r.get("abstract") or ""))
    return texts


def main():
    batch_paths = sorted(glob.glob(os.path.join(PROC, "llm_edges_batch_*.json")))
    if not batch_paths:
        print("[verify] no llm_edges_batch_*.json files yet; workers still running")
        return 1
    abstracts = load_abstracts()
    print(f"[verify] {len(batch_paths)} batch files, {len(abstracts)} abstracts indexed")

    verified, failed = [], []
    total = 0
    for path in batch_paths:
        with open(path) as f:
            items = json.load(f)
        items = items if isinstance(items, list) else items.get("edges") or items.get("claims") or []
        for it in items:
            total += 1
            pmid = str(it.get("pmid") or it.get("PMID") or "").strip()
            quote = it.get("source_quote") or it.get("quote") or ""
            subj, obj = (it.get("subject") or ""), (it.get("object") or "")
            reasons = []
            text = abstracts.get(pmid)
            if not text:
                reasons.append("pmid not found in abstract records")
            else:
                t = norm(text)
                if not quote or norm(quote) not in t:
                    reasons.append("source_quote does not string-match the cited abstract")
                for label, name in ((subj, "subject"), (obj, "object")):
                    if label and norm(label) not in t:
                        reasons.append(f"{name} label {label!r} absent from abstract text")
            if reasons:
                failed.append({"claim": it, "reasons": reasons})
            else:
                # normalize to v2 schema
                it["source_quote"] = quote
                it.pop("quote", None)
                verified.append(it)

    out_path = os.path.join(PROC, "llm_edges.json")
    with open(out_path, "w") as f:
        json.dump(verified, f, indent=1)
    fail_path = os.path.join(PROC, "llm_edges_failed.json")
    with open(fail_path, "w") as f:
        json.dump(failed, f, indent=1)

    print(f"[verify] {total} claims checked: {len(verified)} verified -> llm_edges.json, "
          f"{len(failed)} quarantined -> llm_edges_failed.json")
    for fb in failed[:10]:
        c = fb["claim"]
        print(f"  FAIL PMID {c.get('pmid')}: {c.get('subject')} {c.get('relation')} {c.get('object')} | {'; '.join(fb['reasons'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
