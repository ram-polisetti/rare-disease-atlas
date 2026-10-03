#!/usr/bin/env python3
"""Batch-6-only self-check (mirrors scripts/verify_quotes.py logic, read-only).

Checks every claim in data/processed/llm_edges_batch_6.json against
data/processed/extract_batch_6.jsonl:
  1. pmid present in the batch records
  2. source_quote is a verbatim substring of title+abstract (whitespace-normalized,
     case-insensitive)
  3. subject and object labels appear (case-insensitive) in title+abstract,
     with dash/space/nodash variants and GBA/GBA1 aliasing
Usage: python3 scripts/selfcheck_batch6.py
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "data", "processed")


def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


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


def main():
    texts = {}
    with open(os.path.join(PROC, "extract_batch_6.jsonl")) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            texts[str(r.get("pmid", "")).strip()] = (
                (r.get("title") or "") + " " + (r.get("abstract") or ""))
    with open(os.path.join(PROC, "llm_edges_batch_6.json")) as f:
        items = json.load(f)

    ok, fail = 0, []
    for it in items:
        pmid = str(it.get("pmid") or "").strip()
        reasons = []
        text = texts.get(pmid)
        if not text:
            reasons.append("pmid not in extract_batch_6")
        else:
            t = norm(text)
            q = it.get("source_quote") or ""
            if not q or norm(q) not in t:
                reasons.append("quote-not-verbatim")
            for lab, name in ((it.get("subject") or "", "subject"),
                              (it.get("object") or "", "object")):
                if lab and not label_in_text(lab, t):
                    reasons.append(f"{name}-label-missing:{lab!r}")
        if reasons:
            fail.append({"pmid": pmid, "subject": it.get("subject"),
                         "relation": it.get("relation"), "object": it.get("object"),
                         "reasons": reasons})
        else:
            ok += 1
    total = len(items)
    print(f"[selfcheck] {total} claims: {ok} PASS, {len(fail)} FAIL "
          f"({100.0*ok/total:.1f}% pass rate)")
    for fb in fail[:20]:
        print(f"  FAIL {fb['pmid']}: {fb['subject']} {fb['relation']} {fb['object']} "
              f"| {'; '.join(fb['reasons'])}")
    return 0 if total and not fail else 1


if __name__ == "__main__":
    sys.exit(main())
