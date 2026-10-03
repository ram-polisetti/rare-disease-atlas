#!/usr/bin/env python3
"""Build data/processed/reporter_additions.json = {"nodes": [...], "edges": [...]}
from data/raw/reporter_grants.json, per docs/GRAPH_SCHEMA.md.

Funding->researcher ("funds"), researcher->gene/disease ("investigates"),
funding->asset ("awarded_to"). Every edge carries all 10 schema keys.
"""
import json
import os
import re

REPO = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(REPO, "data/raw/reporter_grants.json")
GRAPH = os.path.join(REPO, "data/graph.json")
OUT = os.path.join(REPO, "data/processed/reporter_additions.json")
DATE = "2026-10-03"

# gene symbol -> (HGNC id, disease MONDO id) — all disease ids verified against
# data/graph.json on 2026-10-03
GENE2ID = {
    "GBA": "HGNC:4177", "GLA": "HGNC:4296", "GAA": "HGNC:4065",
    "SMPD1": "HGNC:11120", "NPC1": "HGNC:7897", "NPC2": "HGNC:14537",
    "HEXA": "HGNC:4878", "HEXB": "HGNC:4879", "IDUA": "HGNC:5391",
    "GALC": "HGNC:4115", "ARSA": "HGNC:713", "IDS": "HGNC:5389",
    "SGSH": "HGNC:10818", "NAGLU": "HGNC:7632", "HGSNAT": "HGNC:26527",
    "GNS": "HGNC:4422",
}
GENE2DIS = {
    "GBA": "MONDO:0009265",      # Gaucher
    "GLA": "MONDO:0010526",      # Fabry
    "GAA": "MONDO:0009290",      # Pompe
    "SMPD1": "MONDO:0009756",    # Niemann-Pick A/B
    "NPC1": "MONDO:0009757",     # Niemann-Pick type C1
    "NPC2": "MONDO:0011873",     # Niemann-Pick type C2
    "HEXA": "MONDO:0010100",     # Tay-Sachs
    "HEXB": "MONDO:0010006",     # Sandhoff
    "IDUA": "MONDO:0001586",     # MPS I
    "GALC": "MONDO:0009499",     # Krabbe
    "ARSA": "MONDO:0009591",     # metachromatic leukodystrophy
    "IDS": "MONDO:0010674",      # MPS II
    "SGSH": "MONDO:0009655",     # MPS IIIA
    "NAGLU": "MONDO:0009656",    # MPS IIIB
    "HGSNAT": "MONDO:0009657",   # MPS IIIC
    "GNS": "MONDO:0009658",      # MPS IIID
}
DISEASE2ID = {
    "Gaucher disease": "MONDO:0009265", "Fabry disease": "MONDO:0010526",
    "Pompe disease": "MONDO:0009290", "Niemann-Pick disease": "MONDO:0009756",
    "Tay-Sachs disease": "MONDO:0010100", "Sandhoff disease": "MONDO:0010006",
    "Krabbe disease": "MONDO:0009499",
    "metachromatic leukodystrophy": "MONDO:0009591",
    "mucopolysaccharidosis type I": "MONDO:0001586",
    "Hunter syndrome": "MONDO:0010674",
    "Sanfilippo syndrome": "MONDO:0018937",
    "mucopolysaccharidosis type III": "MONDO:0018937",
}

ALIASES = {
    "GBA": ["GBA", "glucocerebrosidase"], "GLA": ["GLA", "alpha-galactosidase"],
    "GAA": ["GAA", "acid alpha-glucosidase"], "SMPD1": ["SMPD1", "acid sphingomyelinase"],
    "NPC1": ["NPC1"], "NPC2": ["NPC2"],
    "HEXA": ["HEXA", "hexosaminidase A"], "HEXB": ["HEXB", "hexosaminidase B"],
    "IDUA": ["IDUA", "alpha-L-iduronidase"], "GALC": ["GALC", "galactocerebrosidase"],
    "ARSA": ["ARSA", "arylsulfatase A"], "IDS": ["IDS", "iduronate 2-sulfatase"],
    "SGSH": ["SGSH", "heparan sulfamidase"], "NAGLU": ["NAGLU", "alpha-N-acetylglucosaminidase"],
    "HGSNAT": ["HGSNAT"], "GNS": ["GNS"],
    "Gaucher disease": ["Gaucher"], "Fabry disease": ["Fabry"],
    "Pompe disease": ["Pompe"], "Niemann-Pick disease": ["Niemann-Pick"],
    "Tay-Sachs disease": ["Tay-Sachs"], "Sandhoff disease": ["Sandhoff"],
    "Krabbe disease": ["Krabbe"],
    "metachromatic leukodystrophy": ["metachromatic"],
    "mucopolysaccharidosis type I": ["MPS I", "Hurler", "mucopolysaccharidosis I"],
    "Hunter syndrome": ["Hunter", "MPS II"],
    "Sanfilippo syndrome": ["Sanfilippo", "MPS III"],
    "mucopolysaccharidosis type III": ["MPS III", "Sanfilippo"],
}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.strip().lower()).strip("-")


def mentioned(text, aliases):
    """Return True if any alias appears in text (whole-token for short symbols)."""
    toks = {t.strip(".,;:()[]\"'") for t in text.lower().split()}
    for a in aliases:
        al = a.lower()
        if len(al) <= 5:
            if al in toks:
                return True
        elif al in text.lower():
            return True
    return False


def confidence(p, queries):
    title = p.get("project_title") or ""
    rest = (p.get("abstract_text") or "") + " " + " ".join(p.get("terms") or [])
    for q in queries:
        if mentioned(title, ALIASES[q]):
            return "high"
    for q in queries:
        if mentioned(rest, ALIASES[q]):
            return "high"
    return "medium"


def main():
    raw = json.load(open(RAW))
    projects = raw["projects"]
    nodes, edges = {}, []
    seen_edges = set()

    def add_node(n):
        if n["id"] not in nodes:
            nodes[n["id"]] = n

    for p in projects:
        pn = p.get("project_num")
        queries = p.get("_queries", [])
        genes = sorted({q for q in queries if q in GENE2ID})
        conf = confidence(p, queries) if queries else "medium"

        fid = f"NIH:{pn}"
        title = (p.get("project_title") or "Untitled NIH project").strip()
        org = p.get("organization") or {}
        org_name = (org.get("org_name") or "Unknown organization").strip()
        amt = p.get("award_amount")
        fund_ic = (p.get("agency_ic_fundings") or [{}])[0].get("name") if p.get("agency_ic_fundings") else None
        add_node({
            "id": fid, "type": "funding",
            "label": title[:120],
            "synonyms": [pn],
            "description": f"Active NIH award {pn} ({p.get('activity_code', '?')})"
                           f"{' from ' + fund_ic if fund_ic else ''};"
                           f" FY {p.get('fiscal_year')}"
                           f"{'; $' + format(amt, ',') if amt else ''} awarded.",
            "cluster_id": 0,
            "extra": {"project_num": pn, "url": p.get("project_detail_url"),
                      "award_amount": amt, "fiscal_year": p.get("fiscal_year"),
                      "activity_code": p.get("activity_code")},
        })

        # researcher node (contact PI preferred)
        pis = p.get("principal_investigators") or []
        pi = next((x for x in pis if x.get("is_contact_pi")), pis[0] if pis else None)
        rid = None
        if pi:
            name = (pi.get("full_name") or "").strip() or "Unknown PI"
            name = re.sub(r"\s+", " ", name)
            rid = "atlas:researcher:" + slug(name)
            add_node({
                "id": rid, "type": "researcher", "label": name,
                "synonyms": [],
                "description": f"Principal investigator on NIH award {pn}.",
                "cluster_id": 0,
                "extra": {"profile_id": pi.get("profile_id")},
            })

        # asset node (awardee organization)
        aid = "atlas:asset:" + slug(org_name)
        city = org.get("org_city") or ""
        state = org.get("org_state") or ""
        add_node({
            "id": aid, "type": "asset",
            "label": org_name.title(),
            "synonyms": [],
            "description": f"Awardee organization for NIH award {pn}"
                           f"{' (' + city + ', ' + state + ')' if city or state else ''}."
                           " Reusable research infrastructure for rare-disease programs.",
            "cluster_id": 0,
            "extra": {"org_ipf_code": org.get("org_ipf_code")},
        })

        def add_edge(source, target, relation, note):
            key = (source, target, relation)
            if source and target and key not in seen_edges:
                seen_edges.add(key)
                edges.append({
                    "source": source, "target": target, "relation": relation,
                    "evidence": "observed", "confidence": conf,
                    "source_db": "NIH RePORTER", "source_ref": f"RePORTER:{pn}",
                    "date": DATE, "note": note, "contradicts": False,
                })

        note_f = f"NIH award {pn} funds research on {title[:60].rstrip()}."
        add_edge(fid, rid, "funds", note_f)
        add_edge(fid, aid, "awarded_to",
                 f"NIH award {pn} was granted to {org_name.title()[:60]}.")
        for gsym in genes:
            gname = gsym
            add_edge(rid, GENE2ID[gsym], "investigates",
                     f"{(pi.get('full_name') or 'The PI').strip() if pi else 'The PI'} studies the {gname} gene under NIH award {pn}.")
            add_edge(rid, GENE2DIS[gsym], "investigates",
                     f"NIH award {pn} supports work relevant to the {gname}-linked disorder.")
        for d in sorted({q for q in queries if q in DISEASE2ID}):
            add_edge(rid, DISEASE2ID[d], "investigates",
                     f"NIH award {pn} investigates {d}.")

    out = {"nodes": list(nodes.values()), "edges": edges,
           "meta": {"source": "NIH RePORTER v2 API", "retrieved": DATE,
                    "n_grants": len(projects)}}
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print(f"[info] {len(nodes)} nodes, {len(edges)} edges -> {OUT}")


if __name__ == "__main__":
    main()
