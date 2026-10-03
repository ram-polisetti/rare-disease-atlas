#!/usr/bin/env python3
"""Phase 2: merge coverage-gap additions (RePORTER funding, patient orgs) into the
curated intermediate, then rebuild the graph. Mirrors merge_llm_edges.py's pattern.
LLM-claim merging happens separately in merge_llm_edges.py (runs after).

Usage: ~/workspace/.venv/bin/python scripts/merge_additions.py
"""
import json
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
DATE = "2026-10-03"
INTER = os.path.join(DATA, "_curated_intermediate.json")
ADDITIONS = [
    (os.path.join(DATA, "processed", "reporter_additions.json"), "RePORTER"),
    (os.path.join(DATA, "processed", "org_additions.json"), "orgs"),
]
REQUIRED_EDGE_KEYS = {"source", "target", "relation", "evidence", "confidence",
                      "source_db", "source_ref", "date", "note", "contradicts"}


def main():
    inter = json.load(open(INTER))
    nodes, edges = inter["nodes"], inter["edges"]
    seen_nodes = set(nodes)
    seen_edges = {(e["source"], e["target"], e["relation"], e["source_db"]) for e in edges}

    total_nodes = total_edges = 0
    for path, tag in ADDITIONS:
        if not os.path.exists(path):
            print(f"[additions] {path} missing; skipping")
            continue
        d = json.load(open(path))
        n_added = e_added = 0
        for n in d.get("nodes", []):
            nid = n.get("id")
            if not nid or nid in seen_nodes:
                continue
            nodes[nid] = n
            seen_nodes.add(nid)
            n_added += 1
        for e in d.get("edges", []):
            if not REQUIRED_EDGE_KEYS.issubset(e):
                print(f"[additions] {tag}: edge missing keys, skipping: {e.get('source')}->{e.get('target')}")
                continue
            if e["source"] not in seen_nodes or e["target"] not in seen_nodes:
                print(f"[additions] {tag}: unresolved endpoint, skipping: {e['source']}->{e['target']}")
                continue
            key = (e["source"], e["target"], e["relation"], e["source_db"])
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append(e)
            e_added += 1
        print(f"[additions] {tag}: +{n_added} nodes, +{e_added} edges")
        total_nodes += n_added
        total_edges += e_added

    json.dump({"nodes": nodes, "edges": edges}, open(INTER, "w"))
    print(f"[additions] intermediate now {len(nodes)} nodes / {len(edges)} edges")

    env = dict(os.environ, GRAPH_USE_INTERMEDIATE="1")
    r = subprocess.run([os.path.expanduser("~/workspace/.venv/bin/python"),
                        os.path.join(BASE, "scripts", "build_graph.py")],
                       env=env, capture_output=True, text=True)
    print(r.stdout[-1200:])
    if r.returncode != 0:
        print("[additions] BUILD FAILED:\n", r.stderr[-2000:])
        return 2
    with open(os.path.join(BASE, "docs", "log_fragments", "graph.md"), "a") as f:
        f.write(f"\n## Phase 2 coverage additions ({DATE})\n- Merged {total_nodes} nodes / {total_edges} edges "
                f"from reporter_additions.json (NIH RePORTER funding) and org_additions.json "
                f"(EURORDIS, Cure Sanfilippo Foundation); re-ran Louvain + clusters + journeys.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
