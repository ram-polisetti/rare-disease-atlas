#!/usr/bin/env python3
"""Hand-curated patient orgs for the LSD slice; verifies each URL by fetching homepage title.
Saves: data/raw/patient_orgs.json
"""
import json, re, urllib.request, os
from datetime import date

TODAY = date.today().isoformat()
ROOT = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data")

ORGS = [
    {"name": "National Gaucher Foundation", "diseases": ["Gaucher disease"],
     "url": "https://www.gaucherdisease.org",
     "assets": ["ICGG Gaucher Registry (now part of Sanofi Rare Disease Registries); patient/family support programs"]},
    {"name": "Fabry Support & Information Group (FSIG)", "diseases": ["Fabry disease"],
     "url": "https://www.fabry.org",
     "assets": ["Fabry Registry (Sanofi); FSIG patient meetings and support"]},
    {"name": "National Tay-Sachs & Allied Diseases Association (NTSAD)", "diseases": ["Tay-Sachs disease", "Sandhoff disease"],
     "url": "https://www.ntsad.org",
     "assets": ["Family support, research grants; allied diseases include Sandhoff, GM1 gangliosidosis"]},
    {"name": "National Niemann-Pick Disease Foundation (NNPDF)", "diseases": ["Niemann-Pick disease A/B", "Niemann-Pick disease C"],
     "url": "https://nnpdf.org",
     "assets": ["Family support; research funding"]},
    {"name": "International Niemann-Pick Disease Registry (INPDR)", "diseases": ["Niemann-Pick disease C"],
     "url": "https://www.inpdr.org",
     "assets": ["International patient registry for Niemann-Pick C"]},
    {"name": "Acid Maltase Deficiency Association (AMDA)", "diseases": ["Pompe disease"],
     "url": "https://www.amda-pompe.org",
     "assets": ["Pompe Registry (Sanofi); patient assistance and education"]},
    {"name": "National MPS Society", "diseases": ["Mucopolysaccharidosis type I"],
     "url": "https://mpssociety.org",
     "assets": ["Family assistance; research grants; MPS I included in newborn screening advocacy"]},
    {"name": "United Leukodystrophy Foundation (ULF)", "diseases": ["Krabbe disease", "Metachromatic leukodystrophy"],
     "url": "https://ulf.org",
     "assets": ["Leukodystrophy care network; family support"]},
    {"name": "Hunter's Hope Foundation", "diseases": ["Krabbe disease"],
     "url": "https://www.huntershope.org",
     "assets": ["Krabbe newborn-screening advocacy; Leukodystrophy Care Network"]},
    {"name": "National Organization for Rare Disorders (NORD)", "diseases": ["All lysosomal storage diseases (umbrella)"],
     "url": "https://rarediseases.org",
     "assets": ["Rare Disease Database; patient assistance programs; IAMRARE registry platform"]},
]

def check(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; hack-nation-atlas-data-agent/1.0)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read(200000).decode("utf-8", errors="ignore")
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        title = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
        return {"ok": True, "http_status": r.status, "page_title": title}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def main():
    for org in ORGS:
        v = check(org["url"])
        org["url_verified"] = v
        org["source"] = "Hand-curated (agent), URL verified " + TODAY
        print(("OK " if v.get("ok") else "FAIL "), org["name"], "-", v.get("page_title") or v.get("error"))
    with open(f"{ROOT}/raw/patient_orgs.json", "w") as f:
        json.dump({"source": "Hand-curated patient orgs; homepage titles verified by fetch",
                   "retrieved": TODAY, "n_orgs": len(ORGS), "orgs": ORGS}, f, indent=1)
    print(f"saved {len(ORGS)} orgs")

if __name__ == "__main__":
    main()
