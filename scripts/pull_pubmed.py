#!/usr/bin/env python3
"""PubMed via NCBI E-utilities: ~25 abstracts per slice entity (10 diseases + 11 genes).
Saves: data/raw/pubmed_abstracts.jsonl (pmid, title, abstract, authors, journal, year)
"""
import json, time, urllib.request, urllib.parse, os, xml.etree.ElementTree as ET
from datetime import date

TODAY = date.today().isoformat()
ROOT = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data")
API_KEY = os.environ.get("NCBI_API_KEY", "")

DISEASES = {
    "Gaucher disease": "Gaucher disease",
    "Fabry disease": "Fabry disease",
    "Pompe disease": "Pompe disease glycogen storage",
    "Niemann-Pick disease type A/B": "Niemann-Pick disease",
    "Niemann-Pick disease type C": "Niemann-Pick disease type C",
    "Tay-Sachs disease": "Tay-Sachs disease",
    "Sandhoff disease": "Sandhoff disease",
    "Mucopolysaccharidosis type I": "mucopolysaccharidosis type I",
    "Krabbe disease": "Krabbe disease",
    "Metachromatic leukodystrophy": "metachromatic leukodystrophy",
}
GENES = ["GBA", "GLA", "GAA", "SMPD1", "NPC1", "NPC2", "HEXA", "HEXB", "IDUA", "GALC", "ARSA"]
PER_ENTITY = 25

def eutils(path, params, timeout=90):
    params = dict(params)
    if API_KEY:
        params["api_key"] = API_KEY
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/" + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "hack-nation-atlas-data-agent/1.0"})
    time.sleep(0.35)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def esearch_pm(term, retmax):
    out = eutils("esearch.fcgi", {"db": "pubmed", "term": term, "retmax": retmax,
                                  "sort": "relevance", "retmode": "json"})
    d = json.loads(out)
    return d["esearchresult"]["idlist"]

def efetch_abstracts(pmids):
    out = eutils("efetch.fcgi", {"db": "pubmed", "id": ",".join(pmids),
                                 "rettype": "abstract", "retmode": "xml"})
    recs = []
    root = ET.fromstring(out)
    for art in root.findall(".//PubmedArticle"):
        pmid = art.findtext(".//PMID")
        title = (art.findtext(".//ArticleTitle") or "").strip()
        abs_parts = ["".join(ab.itertext()).strip() for ab in art.findall(".//AbstractText")]
        abstract = " ".join(p for p in abs_parts if p)
        authors = [a.findtext("LastName") for a in art.findall(".//Author") if a.findtext("LastName")]
        journal = art.findtext(".//Journal/Title") or art.findtext(".//Journal/ISOAbbreviation") or ""
        year = art.findtext(".//PubDate/Year") or ""
        recs.append({
            "pmid": pmid, "title": title, "abstract": abstract,
            "authors": authors[:8], "journal": journal, "year": year,
            "source": "PubMed (NCBI E-utilities)", "retrieved": TODAY,
        })
    return recs

def main():
    os.makedirs(f"{ROOT}/raw", exist_ok=True)
    total = 0
    with open(f"{ROOT}/raw/pubmed_abstracts.jsonl", "w") as fh:
        # diseases
        for label, term in DISEASES.items():
            try:
                ids = esearch_pm(f'"{term}"[Title/Abstract] AND review[pt]', PER_ENTITY)
                if len(ids) < 10:
                    ids += [i for i in esearch_pm(f'"{term}"[Title/Abstract]', PER_ENTITY) if i not in ids]
                ids = ids[:PER_ENTITY]
                for r in efetch_abstracts(ids):
                    r["query_entity"] = label; r["entity_type"] = "disease"
                    fh.write(json.dumps(r) + "\n"); total += 1
                print(f"{label}: {len(ids)} abstracts")
            except Exception as e:
                print(f"{label}: FAILED {e}")
        # genes
        for g in GENES:
            try:
                ids = esearch_pm(f'"{g}"[gene] AND review[pt]', PER_ENTITY)
                if len(ids) < 10:
                    ids += [i for i in esearch_pm(f'"{g}"[gene]', PER_ENTITY) if i not in ids]
                ids = ids[:PER_ENTITY]
                for r in efetch_abstracts(ids):
                    r["query_entity"] = g; r["entity_type"] = "gene"
                    fh.write(json.dumps(r) + "\n"); total += 1
                print(f"{g}: {len(ids)} abstracts")
            except Exception as e:
                print(f"{g}: FAILED {e}")
    print(f"saved {total} abstracts to pubmed_abstracts.jsonl")

if __name__ == "__main__":
    main()
