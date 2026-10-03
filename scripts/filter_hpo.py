#!/usr/bin/env python3
"""Filter phenotype.hpoa to the LSD slice diseases; join HP labels from hp.json.
Matches hpoa rows via MONDO disease xrefs (OMIM:/ORPHA: ids).
Saves: data/processed/hpo_slice_phenotypes.json (disease -> [(hp_id, label, frequency)])
"""
import json, os, re
from datetime import date
from collections import defaultdict

TODAY = date.today().isoformat()
ROOT = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data")

def main():
    mondo = json.load(open(f"{ROOT}/processed/mondo_slice_diseases.json"))["diseases"]
    # db id -> (mondo_id, label)
    dbid2mondo = {}
    for d in mondo:
        for x in d.get("xrefs") or []:
            x = str(x)
            for prefix in ("OMIM:", "ORPHA:", "Orphanet:"):
                if x.startswith(prefix):
                    dbid = x.replace("Orphanet:", "ORPHA:")
                    dbid2mondo.setdefault(dbid, (d["mondo_id"], d["label"]))
    print(f"{len(dbid2mondo)} OMIM/ORPHA ids mapped to {len(mondo)} MONDO diseases")

    # HP labels from hp.json
    hp = json.load(open(f"{ROOT}/raw/hp.json"))["graphs"][0]["nodes"]
    labels = {}
    for n in hp:
        nid = n.get("id", "")
        m = re.search(r"HP_(\d+)", nid)
        if m and n.get("lbl"):
            labels["HP:" + m.group(1)] = n["lbl"]
    print(f"{len(labels)} HP labels loaded")

    edges = defaultdict(list)
    matched_dbids = set()
    with open(f"{ROOT}/raw/phenotype.hpoa") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 9:
                continue
            db_id, _, _, hp_id, ref, ev, onset, freq, sex = cols[0], cols[1], cols[2], cols[3], cols[4], cols[5], cols[6], cols[7], cols[8]
            if db_id in dbid2mondo and hp_id in labels:
                mondo_id, dlabel = dbid2mondo[db_id]
                edges[(mondo_id, dlabel)].append({
                    "hp_id": hp_id, "hp_label": labels[hp_id],
                    "frequency": freq or None, "evidence": ev, "reference": ref,
                })
                matched_dbids.add(db_id)

    out = []
    for (mid, dlabel), phens in sorted(edges.items()):
        out.append({"mondo_id": mid, "disease_label": dlabel,
                    "n_phenotypes": len(phens), "phenotypes": phens})
    json.dump({"source": "HPO phenotype.hpoa + hp.json (obo releases)",
               "retrieved": TODAY, "n_diseases_with_phenotypes": len(out),
               "matched_dbids": sorted(matched_dbids),
               "diseases": out},
              open(f"{ROOT}/processed/hpo_slice_phenotypes.json", "w"), indent=1)
    print(f"saved phenotypes for {len(out)} diseases")

if __name__ == "__main__":
    main()
