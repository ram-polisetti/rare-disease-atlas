#!/usr/bin/env python3
"""Shared sentence splitter + batch-6 tooling helpers.

Usage:
  python3 scripts/batch6_tools.py print --offset 0 --limit 10
  python3 scripts/batch6_tools.py build   # mappings -> llm_edges_batch_6.json
"""
import argparse
import json
import os
import re
import sys

BASE = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas")
IN = os.path.join(BASE, "data/processed/extract_batch_6.jsonl")
MAPS = os.path.join(BASE, "data/processed/batch6_mappings.json")
OUT = os.path.join(BASE, "data/processed/llm_edges_batch_6.json")


def split_sentences(text):
    text = re.sub(r"\s+", " ", (text or "")).strip()
    if not text:
        return []
    # split on sentence-ending punctuation followed by space + capital/quote/digit
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])", text)
    # rejoin fragments that end with a known abbreviation
    abbr = re.compile(r"\b(e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|St|Fig|fig|al|No|no)\.$")
    merged = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if merged and abbr.search(merged[-1]):
            merged[-1] = merged[-1] + " " + p
        else:
            merged.append(p)
    return merged


def load_records():
    return [json.loads(l) for l in open(IN) if l.strip()]


def cmd_print(offset, limit):
    recs = load_records()[offset:offset + limit]
    for i, r in enumerate(recs):
        gi = offset + i
        print(f"===== [{gi}] {r['pmid']} | {r['query_entity']} ({r['entity_type']}) | {r['journal']} {r['year']}")
        print("TITLE:", r["title"])
        sents = split_sentences(r["title"] + " " + r["abstract"])
        for j, s in enumerate(sents):
            print(f"  ({j}) {s}")
        print()


def cmd_build():
    recs = {r["pmid"]: r for r in load_records()}
    mappings = json.load(open(MAPS))
    seen, edges = set(), []
    skipped = []
    for m in mappings:
        pmid = m["pmid"]
        r = recs.get(pmid)
        if not r:
            skipped.append((pmid, "pmid-not-found"))
            continue
        sents = split_sentences(r["title"] + " " + r["abstract"])
        for c in m.get("claims", []):
            idx = c["sentences"]
            if isinstance(idx, int):
                idx = [idx, idx]
            span = " ".join(sents[idx[0]:idx[1] + 1]) if 0 <= idx[0] < len(sents) else ""
            if not span:
                skipped.append((pmid, f"bad sentence index {c['sentences']}"))
                continue
            key = (c["subject"].strip().lower(), c["relation"], c["object"].strip().lower())
            if key in seen:
                continue
            seen.add(key)
            edges.append({
                "subject": c["subject"].strip(),
                "relation": c["relation"],
                "object": c["object"].strip(),
                "pmid": pmid,
                "source_quote": span,
                "confidence": c.get("confidence", "medium"),
                "contradicts": bool(c.get("contradicts", False)),
            })
    with open(OUT, "w") as f:
        json.dump(edges, f, indent=1)
    json.load(open(OUT))
    print(f"built {len(edges)} edges -> {OUT}; skipped: {len(skipped)}")
    for s in skipped[:10]:
        print("  SKIP", s)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("print")
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--limit", type=int, default=10)
    sub.add_parser("build")
    args = ap.parse_args()
    if args.cmd == "print":
        cmd_print(args.offset, args.limit)
    else:
        cmd_build()


if __name__ == "__main__":
    main()
