#!/usr/bin/env python3
"""Quote-restoration pass for the merged rare-disease atlas graph.

RUNBOOK
-------
Context: Phase 2 extraction is CLOSED. scripts/merge_llm_edges.py already merged
the 944 grounded LLM claims into the graph (data/graph.json, 1546 nodes /
4060 edges), but it truncated each claim's verbatim source_quote to 200 chars
inside the edge `note`. The grounded-extraction story (and the site UI's edge
evidence panel) needs the FULL verbatim quote.

What this script does (idempotent, safe to re-run):
  1. Reads every claim in data/processed/llm_edges*.json (batch files +
     the concatenated llm_edges.json).
  2. Resolves each claim's subject/object labels to node ids using the same
     label/synonym/alias lookup as merge_llm_edges.py.
  3. Finds the matching graph edge (source, target, relation,
     source_db == "PubMed") and writes the full claim text to
     edge["source_quote"]. Nothing else on the edge is changed: no edges are
     added or removed, so clusters / journeys / Louvain results are untouched.
  4. Validates every edge still carries the schema-required fields
     (source, target, relation, source_db, source_ref, date, confidence,
     evidence) and writes the graph back.

Run:  ~/workspace/.venv/bin/python scripts/merge_graph.py   (from repo root)
"""

import glob
import json
import os
import shutil
import sys

BASE = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas")
GRAPH_PATH = os.path.join(BASE, "data", "graph.json")
DATE = "2026-10-03"

# Alias table copied verbatim from scripts/merge_llm_edges.py so endpoint
# resolution matches the original merge exactly.
ALIASES = {
    "gaucher disease": "MONDO:0009265", "fabry disease": "MONDO:0010526",
    "pompe disease": "MONDO:0009290", "gba": "HGNC:4177", "gba1": "HGNC:4177",
    "gla": "HGNC:4296", "gaa": "HGNC:4065", "smpd1": "HGNC:11120",
    "npc1": "HGNC:7897", "npc2": "HGNC:14537", "hexa": "HGNC:4878",
    "hexb": "HGNC:4879", "idua": "HGNC:5391", "galc": "HGNC:4115",
    "arsa": "HGNC:713", "tay-sachs disease": "MONDO:0010100",
    "sandhoff disease": "MONDO:0010006", "krabbe disease": "MONDO:0009499",
    "niemann-pick disease": "MONDO:0009756",
    "parkinson disease": "MONDO:0008199",
    "late-onset parkinson disease": "MONDO:0008199",
    "lewy body dementia": "MONDO:0007488",
    "ids": "HGNC:5389",
    "hunter": "MONDO:0010674",
    "hunter syndrome": "MONDO:0010674",
    "mps ii": "MONDO:0010674",
    "mucopolysaccharidosis type ii": "MONDO:0010674",
    "sgsh": "HGNC:10818",
    "mps iiia": "MONDO:0009655",
    "sanfilippo a": "MONDO:0009655",
    "sanfilippo syndrome a": "MONDO:0009655",
    "sanfilippo syndrome type a": "MONDO:0009655",
    "mucopolysaccharidosis type iiia": "MONDO:0009655",
    "naglu": "HGNC:7632",
    "mps iiib": "MONDO:0009656",
    "sanfilippo b": "MONDO:0009656",
    "sanfilippo syndrome b": "MONDO:0009656",
    "sanfilippo syndrome type b": "MONDO:0009656",
    "mucopolysaccharidosis type iiib": "MONDO:0009656",
    "hgsnat": "HGNC:26527",
    "mps iiic": "MONDO:0009657",
    "sanfilippo c": "MONDO:0009657",
    "sanfilippo syndrome c": "MONDO:0009657",
    "sanfilippo syndrome type c": "MONDO:0009657",
    "mucopolysaccharidosis type iiic": "MONDO:0009657",
    "gns": "HGNC:4422",
    "mps iiid": "MONDO:0009658",
    "sanfilippo d": "MONDO:0009658",
    "sanfilippo syndrome d": "MONDO:0009658",
    "sanfilippo syndrome type d": "MONDO:0009658",
    "mucopolysaccharidosis type iiid": "MONDO:0009658",
    "sanfilippo syndrome": "MONDO:0018937",
    "mps iii": "MONDO:0018937",
}


def pick(d, *keys):
    for k in keys:
        if k in d and d[k]:
            return d[k]
    return None


def load_claims():
    claims, seen = [], set()
    paths = sorted(glob.glob(os.path.join(BASE, "data", "processed", "llm_edges*.json")))
    for p in paths:
        if os.path.basename(p) == "llm_edges_failed.json":
            continue
        raw = json.load(open(p))
        items = raw if isinstance(raw, list) else raw.get("edges") or raw.get("claims") or []
        for it in items:
            key = json.dumps(it, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            claims.append(it)
    return claims


def main():
    graph = json.load(open(GRAPH_PATH))
    nodes, edges = graph["nodes"], graph["edges"]

    lookup = {}
    for n in nodes:
        lookup[n["label"].strip().lower()] = n["id"]
        for s in n.get("synonyms", []):
            lookup.setdefault(s.strip().lower(), n["id"])
    for alias, nid in ALIASES.items():
        lookup.setdefault(alias, nid)

    # index PubMed edges by (source, target, relation)
    edge_index = {}
    for e in edges:
        if e.get("source_db") == "PubMed":
            edge_index.setdefault((e["source"], e["target"], e["relation"]), []).append(e)

    claims = load_claims()
    print(f"[merge_graph] {len(claims)} unique claims; {len(edge_index)} PubMed edge keys in graph")

    matched = already = unresolved = no_edge = 0
    for it in claims:
        subj = pick(it, "subject", "source", "entity_a", "head")
        obj = pick(it, "object", "target", "entity_b", "tail")
        rel = pick(it, "relation", "predicate", "edge_type") or "extracted_claim"
        quote = pick(it, "source_quote", "quote", "evidence_text", "sentence", "text") or ""
        s = lookup.get(str(subj).strip().lower()) if subj else None
        t = lookup.get(str(obj).strip().lower()) if obj else None
        if not s or not t:
            unresolved += 1
            continue
        cands = edge_index.get((s, t, rel), [])
        if not cands:
            no_edge += 1
            continue
        e = cands[0]
        if e.get("source_quote"):
            already += 1
            continue
        e["source_quote"] = quote
        matched += 1

    print(f"[merge_graph] quotes restored: {matched}; already had quote: {already}; "
          f"claim unresolvable: {unresolved}; no graph edge: {no_edge}")

    # schema validation: every edge must carry the required fields
    required = ("source", "target", "relation", "source_db", "source_ref",
                "date", "confidence", "evidence")
    bad = [e for e in edges if any(not e.get(f) for f in required)]
    if bad:
        print(f"[merge_graph] VALIDATION FAILED: {len(bad)} edges missing required fields")
        return 1
    quoted = sum(1 for e in edges if e.get("source_db") == "PubMed" and e.get("source_quote"))
    pubmed = sum(1 for e in edges if e.get("source_db") == "PubMed")
    print(f"[merge_graph] validation OK: {len(edges)} edges, "
          f"{quoted}/{pubmed} PubMed edges carry full source_quote")

    shutil.copy2(GRAPH_PATH, GRAPH_PATH + ".pre-quote-restore.bak")
    with open(GRAPH_PATH, "w") as f:
        json.dump(graph, f)
    print("[merge_graph] wrote", GRAPH_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
