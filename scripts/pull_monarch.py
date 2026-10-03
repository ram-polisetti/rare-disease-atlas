#!/usr/bin/env python3
"""Pull Monarch Biolink v3 gene->disease associations for the LSD slice + MONDO entity details.
Saves: data/raw/monarch_gene_disease_associations.json
       data/processed/mondo_slice_diseases.json (diseases + synonyms + xrefs)
"""
import json, time, urllib.request, urllib.parse, os
from datetime import date

BASE = "https://api-v3.monarchinitiative.org/v3/api"
TODAY = date.today().isoformat()
ROOT = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data")

GENES = ["GBA", "GLA", "GAA", "SMPD1", "NPC1", "NPC2", "HEXA", "HEXB", "IDUA", "GALC", "ARSA"]

def get(path, params=None):
    q = f"{BASE}{path}"
    if params:
        q += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(q, headers={"User-Agent": "hack-nation-atlas-data-agent/1.0 (charan research)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

SYMBOL_ALIASES = {"GBA": "GBA1"}  # NCBI/Monarch canonical symbol for the Gaucher gene

def resolve_gene(symbol):
    # Use search endpoint to resolve symbol -> HGNC id; strict exact-name match
    q = SYMBOL_ALIASES.get(symbol, symbol)
    res = get("/search", {"q": q, "category": "biolink:Gene", "limit": 10})
    for item in res.get("items", []):
        if str(item.get("id", "")).startswith("HGNC") and (item.get("name") or "").upper() == q.upper():
            return item["id"], item.get("name")
    raise RuntimeError(f"could not resolve gene {symbol} (query {q})")

def main():
    gene_map = {}
    for g in GENES:
        gid, name = resolve_gene(g)
        gene_map[g] = {"id": gid, "name": name}
        print(f"{g} -> {gid} ({name})")
        time.sleep(0.35)

    all_assocs = []
    disease_ids = {}
    for g in GENES:
        gid = gene_map[g]["id"]
        for cat in ["biolink:CausalGeneToDiseaseAssociation", "biolink:CorrelatedGeneToDiseaseAssociation"]:
            res = get("/association", {
                "subject": gid, "category": cat, "limit": 100,
            })
            for a in res.get("items", []):
                a["_gene_symbol"] = g
                a["_retrieved"] = TODAY
                a["_source"] = "Monarch Biolink API v3"
                all_assocs.append(a)
                obj = a.get("object")
                if obj and obj.startswith("MONDO:"):
                    disease_ids[obj] = a.get("object_label")
            time.sleep(0.35)
        print(f"{g}: associations so far total={len(all_assocs)}")
    # de-dupe on (subject, predicate, object)
    seen, uniq = set(), []
    for a in all_assocs:
        k = (a.get("subject"), a.get("predicate"), a.get("object"))
        if k not in seen:
            seen.add(k); uniq.append(a)

    raw = {
        "source": "Monarch Biolink API v3 (https://api-v3.monarchinitiative.org/v3/api/)",
        "retrieved": TODAY,
        "genes": gene_map,
        "n_associations": len(uniq),
        "associations": uniq,
    }
    with open(f"{ROOT}/raw/monarch_gene_disease_associations.json", "w") as f:
        json.dump(raw, f, indent=1)
    print(f"saved {len(uniq)} unique associations; {len(disease_ids)} distinct MONDO diseases")

    # Entity details for each disease: label, synonyms, xrefs
    diseases = []
    for mid, lbl in disease_ids.items():
        try:
            ent = get(f"/entity/{urllib.parse.quote(mid, safe='')}")
            time.sleep(0.35)
        except Exception as e:
            print(f"entity fetch failed for {mid}: {e}")
            ent = {"id": mid, "name": lbl}
        diseases.append({
            "mondo_id": mid,
            "label": ent.get("name") or lbl,
            "synonyms": ent.get("synonym") or ent.get("synonyms") or [],
            "xrefs": ent.get("xref") or ent.get("xrefs") or [],
            "definition": ent.get("definition"),
            "source": "Monarch Biolink API v3",
            "retrieved": TODAY,
        })
    with open(f"{ROOT}/processed/mondo_slice_diseases.json", "w") as f:
        json.dump({"source": "Monarch Biolink API v3", "retrieved": TODAY,
                   "n_diseases": len(diseases), "diseases": diseases}, f, indent=1)
    print(f"saved {len(diseases)} disease entities")

if __name__ == "__main__":
    main()
