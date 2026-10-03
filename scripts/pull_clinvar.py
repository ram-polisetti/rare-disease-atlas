#!/usr/bin/env python3
"""ClinVar via NCBI E-utilities: top pathogenic/likely-pathogenic variants per slice gene.
Saves: data/raw/clinvar_variants.json, data/processed/clinvar_slice_variants.json
"""
import json, time, urllib.request, urllib.parse, os
from datetime import date

TODAY = date.today().isoformat()
ROOT = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data")
GENES = ["GBA", "GLA", "GAA", "SMPD1", "NPC1", "NPC2", "HEXA", "HEXB", "IDUA", "GALC", "ARSA"]
# ClinVar/NCBI gene symbol actually used for the Gaucher gene
CLINVAR_SYMBOLS = {"GBA": "GBA1"}
API_KEY = os.environ.get("NCBI_API_KEY", "")

def eutils(path, params):
    params = dict(params)
    if API_KEY:
        params["api_key"] = API_KEY
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/" + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "hack-nation-atlas-data-agent/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()

def esearch(db, term, retmax=100):
    time.sleep(0.35)
    out = eutils("esearch.fcgi", {"db": db, "term": term, "retmax": retmax, "retmode": "json"})
    d = json.loads(out)
    return d["esearchresult"]["idlist"], int(d["esearchresult"]["count"])

def esummary(db, ids):
    time.sleep(0.35)
    out = eutils("esummary.fcgi", {"db": db, "id": ",".join(ids), "retmode": "json"})
    d = json.loads(out)["result"]
    return [d[i] for i in d.get("uids", [])]

def parse_variant(gene, s):
    sig = s.get("clinical_significance", {})
    traits = s.get("trait_set", [])
    conditions = [t.get("trait_name") for t in traits if t.get("trait_name")]
    # HGVS from name/title or variation_set
    name = s.get("title") or s.get("name") or ""
    hgvs = s.get("variation_set", [{}])[0].get("variation_name", "") if s.get("variation_set") else ""
    return {
        "gene_symbol": gene,
        "clinvar_id": s.get("uid"),
        "accession": s.get("accession"),
        "title": name,
        "hgvs": hgvs,
        "clinical_significance": sig.get("description", "") if isinstance(sig, dict) else str(sig),
        "conditions": conditions,
        "review_status": s.get("review_status"),
        "source": "ClinVar (NCBI E-utilities esearch/esummary)",
        "retrieved": TODAY,
    }

def main():
    raw_all = []
    top = {}
    for gene in GENES:
        qgene = CLINVAR_SYMBOLS.get(gene, gene)
        term = f'{qgene}[gene] AND ("pathogenic"[Clinical significance] OR "likely pathogenic"[Clinical significance])'
        try:
            ids, count = esearch("clinvar", term, retmax=80)
            print(f"{gene}: {count} pathogenic/likely-pathogenic ClinVar records, fetching {len(ids)}")
            variants = [parse_variant(gene, s) for s in esummary("clinvar", ids)] if ids else []
        except Exception as e:
            print(f"{gene}: FAILED {e}")
            variants = []
        raw_all.extend(variants)
        # keep top 10 per gene: prefer reviewed pathogenic over likely pathogenic
        def rank(v):
            s = v["clinical_significance"].lower()
            return (0 if "pathogenic" in s and "likely" not in s else 1, v["clinvar_id"])
        top[gene] = sorted(variants, key=rank)[:10]
    with open(f"{ROOT}/raw/clinvar_variants.json", "w") as f:
        json.dump({"source": "ClinVar via NCBI E-utilities", "retrieved": TODAY,
                   "n_records": len(raw_all), "records": raw_all}, f, indent=1)
    with open(f"{ROOT}/processed/clinvar_slice_variants.json", "w") as f:
        json.dump({"source": "ClinVar via NCBI E-utilities", "retrieved": TODAY,
                   "genes": top}, f, indent=1)
    print(f"saved {len(raw_all)} raw records; top-10 per gene")

if __name__ == "__main__":
    main()
