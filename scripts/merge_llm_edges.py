#!/usr/bin/env python3
"""Phase 2: merge data/processed/llm_edges.json claims into the curated graph,
then re-run analysis (Louvain + clusters + journeys) via build_graph in
intermediate mode. Use ~/workspace/.venv/bin/python.

The extraction agent's exact schema is unknown, so claim records are parsed
defensively: each item may use any of several key spellings. Both endpoints must
resolve to existing node ids (via label/synonym lookup); unresolvable claims
are logged and skipped, never invented as nodes.
"""
import json, os, re, sys, subprocess

BASE = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas")
DATA = os.path.join(BASE, "data")
DATE = "2026-10-03"
LLM_PATH = os.path.join(DATA, "processed", "llm_edges.json")
INTER = os.path.join(DATA, "_curated_intermediate.json")

def pick(d, *keys):
    for k in keys:
        if k in d and d[k]:
            return d[k]
    return None

def main():
    if not os.path.exists(LLM_PATH):
        print("[merge] llm_edges.json not present; nothing to merge")
        return 1
    raw = json.load(open(LLM_PATH))
    items = raw if isinstance(raw, list) else raw.get("edges") or raw.get("claims") or []
    print(f"[merge] {len(items)} raw LLM claim records")

    inter = json.load(open(INTER))
    nodes, edges = inter["nodes"], inter["edges"]
    lookup = {}
    for nid, n in nodes.items():
        lookup[n["label"].strip().lower()] = nid
        for s in n.get("synonyms", []):
            lookup.setdefault(s.strip().lower(), nid)
    # common aliases the extractor might use
    for alias, nid in {
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
    }.items():
        lookup.setdefault(alias, nid)

    seen = {(e["source"], e["target"], e["relation"], e["source_db"]) for e in edges}
    added, skipped = 0, []
    for it in items:
        subj = pick(it, "subject", "source", "entity_a", "head")
        obj = pick(it, "object", "target", "entity_b", "tail")
        rel = pick(it, "relation", "predicate", "edge_type") or "extracted_claim"
        pmid = pick(it, "pmid", "PMID", "source_pmid")
        quote = pick(it, "source_quote", "quote", "evidence_text", "sentence", "text") or ""
        conf = str(pick(it, "confidence", "conf") or "medium").lower()
        conf = conf if conf in ("high", "medium", "low") else "medium"
        contra = bool(it.get("contradicts", False))
        s = lookup.get(str(subj).strip().lower()) if subj else None
        t = lookup.get(str(obj).strip().lower()) if obj else None
        if not s or not t:
            skipped.append((subj, obj))
            continue
        key = (s, t, rel, "PubMed")
        if key in seen:
            continue
        seen.add(key)
        edges.append({
            "source": s, "target": t, "relation": rel,
            "evidence": "observed", "confidence": conf,
            "source_db": "PubMed",
            "source_ref": f"PMID:{pmid}" if pmid else "PubMed",
            "date": DATE,
            "note": (quote[:200] + ("..." if len(quote) > 200 else "")) or "LLM-extracted claim from slice literature.",
            "contradicts": contra,
        })
        added += 1

    with open(INTER, "w") as f:
        json.dump({"nodes": nodes, "edges": edges}, f)
    print(f"[merge] added {added} LLM edges, skipped {len(skipped)} unresolvable")
    for subj, obj in skipped[:10]:
        print(f"  skipped: {subj!r} -> {obj!r}")

    env = dict(os.environ, GRAPH_USE_INTERMEDIATE="1", GRAPH_LLM_MERGED="1")
    r = subprocess.run([os.path.expanduser("~/workspace/.venv/bin/python"),
                        os.path.join(BASE, "scripts", "build_graph.py")],
                       env=env, capture_output=True, text=True)
    print(r.stdout[-1500:])
    if r.returncode != 0:
        print("[merge] BUILD FAILED:\n", r.stderr[-2000:])
        return 2
    # log the merge
    logp = os.path.join(BASE, "docs", "log_fragments", "graph.md")
    with open(logp, "a") as f:
        f.write(f"\n## Phase 2 merge ({DATE})\n- Merged {added} LLM-extracted edges "
                f"(source_db=PubMed, evidence=observed) from data/processed/llm_edges.json; "
                f"skipped {len(skipped)} unresolvable claims (no invented nodes).\n"
                f"- Re-ran Louvain + cluster summaries + Maria journey on the merged graph.\n")
    return 0

if __name__ == "__main__":
    sys.exit(main())
