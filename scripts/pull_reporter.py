#!/usr/bin/env python3
"""Pull active NIH RePORTER v2 projects for the rare-disease slice (LSD genes/diseases).

Writes raw JSON to data/raw/reporter_grants.json.
Append-safe: if the file already exists, merges by projectNumber (keeps old records).

Step-by-step log: see ../fleetrepo/project-logs/ if maintained by coordinator.
Decisions: one query per gene symbol + one per disease name (28 queries); keep only
projects whose title/abstract actually names the gene or disease (kills noise for
short symbols like GLA/GAA); dedupe by projectNumber; cap at 100 most relevant.
"""
import json
import os
import time
import urllib.request

API = "https://api.reporter.nih.gov/v2/projects/search"
OUT = os.path.join(os.path.dirname(__file__), "../data/raw/reporter_grants.json")
DATE = "2026-10-03"

GENES = ["GBA", "GLA", "GAA", "SMPD1", "NPC1", "NPC2", "HEXA", "HEXB",
         "IDUA", "GALC", "ARSA", "IDS", "SGSH", "NAGLU", "HGSNAT", "GNS"]

DISEASES = ["Gaucher disease", "Fabry disease", "Pompe disease",
            "Niemann-Pick disease", "Tay-Sachs disease", "Sandhoff disease",
            "Krabbe disease", "metachromatic leukodystrophy",
            "mucopolysaccharidosis type I", "Hunter syndrome",
            "Sanfilippo syndrome", "mucopolysaccharidosis type III"]

INCLUDE = None  # API ignores includeFields; parse snake_case keys instead

# RePORTER v2 uses snake_case record keys
K_NUM, K_TITLE, K_ABS = "project_num", "project_title", "abstract_text"
K_AMT, K_PI, K_ORG = "award_amount", "principal_investigators", "organization"


def search(text, offset=0, limit=100):
    # v2 criteria are snake_case per https://api.reporter.nih.gov/
    body = json.dumps({
        "criteria": {
            "advanced_text_search": {
                "operator": "and",
                "search_field": "projecttitle,abstracttext,terms",
                "search_text": text,
            },
            "fiscal_years": [2024, 2025, 2026],
            "include_active_projects": True,
            "use_relevance": True,
        },
        "offset": offset,
        "limit": limit,
        "sort_field": "fiscal_year",
        "sort_order": "desc",
    }).encode()
    req = urllib.request.Request(API, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def names_of(text):
    """Gene/disease aliases that count as an explicit match."""
    aliases = {
        "GBA": ["GBA", "glucocerebrosidase"],
        "GLA": ["GLA", "alpha-galactosidase"],
        "GAA": ["GAA", "acid alpha-glucosidase"],
        "SMPD1": ["SMPD1", "acid sphingomyelinase"],
        "NPC1": ["NPC1"], "NPC2": ["NPC2"],
        "HEXA": ["HEXA", "hexosaminidase A", "beta-hexosaminidase"],
        "HEXB": ["HEXB", "hexosaminidase B"],
        "IDUA": ["IDUA", "alpha-L-iduronidase"],
        "GALC": ["GALC", "galactocerebrosidase"],
        "ARSA": ["ARSA", "arylsulfatase A"],
        "IDS": ["IDS", "iduronate 2-sulfatase"],
        "SGSH": ["SGSH", "heparan sulfamidase"],
        "NAGLU": ["NAGLU", "alpha-N-acetylglucosaminidase"],
        "HGSNAT": ["HGSNAT"],
        "GNS": ["GNS", "N-acetylglucosamine-6-sulfatase"],
        "Gaucher disease": ["Gaucher"], "Fabry disease": ["Fabry"],
        "Pompe disease": ["Pompe"], "Niemann-Pick disease": ["Niemann-Pick"],
        "Tay-Sachs disease": ["Tay-Sachs"], "Sandhoff disease": ["Sandhoff"],
        "Krabbe disease": ["Krabbe"],
        "metachromatic leukodystrophy": ["metachromatic"],
        "mucopolysaccharidosis type I": ["MPS I", "Hurler", "mucopolysaccharidosis I"],
        "Hunter syndrome": ["Hunter", "MPS II", "mucopolysaccharidosis II"],
        "Sanfilippo syndrome": ["Sanfilippo", "MPS III", "mucopolysaccharidosis III"],
        "mucopolysaccharidosis type III": ["MPS III", "Sanfilippo"],
    }
    return aliases.get(text, [text])


def explicit_hit(project, queries_hit):
    text = ((project.get(K_TITLE) or "") + " " +
            (project.get(K_ABS) or "")).lower()
    for q in queries_hit:
        for alias in names_of(q):
            a = alias.lower()
            # whole-token match for short gene symbols
            if len(a) <= 5:
                if any(tok.strip(".,;:()[]") == a for tok in text.split()):
                    return True
            elif a in text:
                return True
    return False


def main():
    by_number = {}
    query_of = {}  # projectNumber -> list of query strings that matched it
    for q in GENES + DISEASES:
        # exact phrases for multi-word disease names
        text = f'"{q}"' if " " in q else q
        try:
            payload = search(q)
        except Exception as e:
            print(f"[warn] query {q!r} failed: {e}")
            continue
        results = payload.get("results", [])
        print(f"[info] {q!r}: {payload.get('meta', {}).get('totalCount', '?')} total, pulled {len(results)}")
        for p in results:
            pn = p.get(K_NUM)
            if not pn:
                continue
            if pn not in by_number:
                by_number[pn] = p
                query_of[pn] = []
            query_of[pn].append(q)
        time.sleep(1)

    kept = []
    for pn, p in by_number.items():
        if explicit_hit(p, query_of[pn]):
            p["_queries"] = query_of[pn]
            kept.append(p)

    # rank: prefer projects with more distinct query hits, then larger award
    def rank(p):
        qs = len(set(p["_queries"]))
        amt = max((int(p.get(K_AMT) or 0) for fy in [p]), default=0)
        return (-qs, -amt)
    kept.sort(key=rank)
    kept = kept[:100]
    print(f"[info] kept {len(kept)} relevant projects")

    record = {"source": "NIH RePORTER v2 API", "retrieved": DATE,
              "queries": GENES + DISEASES, "projects": kept}

    if os.path.exists(OUT):
        old = json.load(open(OUT))
        old_by = {p[K_NUM]: p for p in old.get("projects", []) if p.get(K_NUM)}
        for p in kept:
            old_by[p[K_NUM]] = p  # byte-append style: merge, never delete
        record["projects"] = list(old_by.values())
        print(f"[info] merged with existing file: {len(record['projects'])} total")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(record, f, indent=1)
    print(f"[info] wrote {OUT}")


if __name__ == "__main__":
    main()
