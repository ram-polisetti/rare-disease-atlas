#!/usr/bin/env python3
"""Assemble one batch from the Idris checkpoint: validate v2 grounding rules,
drop failures (report them), dedupe identical (subject, relation, object),
write data/processed/llm_edges_batch_N.json.
Usage: python3 scripts/assemble_batch_idris.py 0|1
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "data", "processed")
RELATIONS = ("caused_by_variant_in", "treated_by", "studied_in", "associated_with",
             "presents_with", "encodes", "disrupts", "accumulates_in")


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
    n = sys.argv[1]
    recs = [json.loads(l) for l in open(os.path.join(PROC, f"extract_batch_{n}.jsonl")) if l.strip()]
    texts = {str(r.get("pmid", "")).strip():
             ((r.get("title") or "") + " " + (r.get("abstract") or "")) for r in recs}
    ckpt_path = os.path.join(PROC, f"extract_batch_{n}_checkpoint_idris.jsonl")
    raw_claims = []
    for l in open(ckpt_path):
        o = json.loads(l)
        for c in o.get("claims", []):
            raw_claims.append((str(o["pmid"]), c))

    kept, dropped = [], []
    for pmid, c in raw_claims:
        reasons = []
        s = (c.get("subject") or "").strip()
        r = (c.get("relation") or "").strip()
        o = (c.get("object") or "").strip()
        q = (c.get("source_quote") or "").strip()
        conf = c.get("confidence")
        contra = bool(c.get("contradicts", False))
        text = texts.get(pmid)
        if not text:
            reasons.append("pmid-not-in-batch")
        else:
            t = norm(text)
            if not (s and r and o):
                reasons.append("empty-field")
            if r not in RELATIONS:
                reasons.append(f"bad-relation:{r}")
            if not q or len(norm(q)) < 8:
                reasons.append("quote-too-short")
            elif norm(q) not in t:
                reasons.append("quote-not-verbatim")
            if not label_in_text(s, t):
                reasons.append(f"subject-missing:{s!r}")
            if not label_in_text(o, t):
                reasons.append(f"object-missing:{o!r}")
            if conf not in ("high", "medium"):
                reasons.append(f"bad-confidence:{conf}")
        if reasons:
            dropped.append({"pmid": pmid, "claim": c, "reasons": reasons})
        else:
            kept.append({"subject": s, "relation": r, "object": o, "pmid": pmid,
                         "source_quote": q, "confidence": conf, "contradicts": contra})

    # dedupe identical (subject, relation, object) within batch (keep first)
    seen, edges = set(), []
    for c in kept:
        key = (norm(c["subject"]), c["relation"], norm(c["object"]))
        if key in seen:
            continue
        seen.add(key)
        edges.append(c)

    out = os.path.join(PROC, f"llm_edges_batch_{n}.json")
    with open(out, "w") as f:
        json.dump(edges, f, indent=1, ensure_ascii=False)
    json.load(open(out))  # parse check
    total = len(raw_claims)
    print(f"[assemble batch {n}] records={len(recs)} raw_claims={total} "
          f"kept_valid={len(kept)} dropped={len(dropped)} deduped_final={len(edges)}")
    print(f"[assemble batch {n}] wrote {out} (JSON parses OK)")
    for d in dropped[:30]:
        c = d["claim"]
        print(f"  DROPPED {d['pmid']}: {c.get('subject')} {c.get('relation')} {c.get('object')} | {'; '.join(d['reasons'])}")
    return 0 if not dropped else 2


if __name__ == "__main__":
    sys.exit(main())
