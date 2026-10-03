#!/usr/bin/env python3
"""Top-up: fetch additional Europe PMC PPR pages, keep bioRxiv|medRxiv only.

Appends to data/raw/preprint_records.jsonl (after rewriting it to keep only
bioRxiv|medRxiv records). Target: ~100 total records.
"""
import json, os, re, time, urllib.request, urllib.parse
from difflib import SequenceMatcher

ROOT = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data")
TODAY = "2026-10-03"
DATERANGE = "FIRST_PDATE:[2024-01-01 TO 2026-10-03]"
TARGET = 100

GENES = ["GBA", "GLA", "GAA", "SMPD1", "NPC1", "NPC2", "HEXA", "HEXB",
         "IDUA", "GALC", "ARSA", "IDS", "SGSH", "NAGLU", "HGSNAT", "GNS"]
DISEASES = [
    ("Gaucher disease", '"Gaucher disease"'),
    ("Fabry disease", '"Fabry disease"'),
    ("Pompe disease", '"Pompe disease"'),
    ("Niemann-Pick disease", '"Niemann-Pick disease"'),
    ("Tay-Sachs disease", '"Tay-Sachs disease"'),
    ("Sandhoff disease", '"Sandhoff disease"'),
    ("Krabbe disease", '"Krabbe disease"'),
    ("Metachromatic leukodystrophy", '"metachromatic leukodystrophy"'),
    ("MPS I", '"mucopolysaccharidosis type I"'),
    ("MPS II (Hunter)", '"Hunter syndrome"'),
    ("MPS III (Sanfilippo)", '"Sanfilippo syndrome"'),
    ("MPS III (Sanfilippo)", '"mucopolysaccharidosis type III"'),
]
# entity -> total hits from the first run (only those with hits>25 can have page 2)
HITS = {"GBA": 299, "GLA": 132, "GAA": 262, "SMPD1": 19, "NPC1": 76, "NPC2": 47,
        "HEXA": 117, "HEXB": 1684, "IDUA": 17, "GALC": 63, "ARSA": 53, "IDS": 1531,
        "SGSH": 9, "NAGLU": 12, "HGSNAT": 10, "GNS": 43,
        "Gaucher disease": 63, "Fabry disease": 63, "Pompe disease": 31,
        "Niemann-Pick disease": 48, "Tay-Sachs disease": 8, "Sandhoff disease": 10,
        "Krabbe disease": 12, "Metachromatic leukodystrophy": 16, "MPS I": 16,
        "MPS II (Hunter)": 9}


def get(url, timeout=60, retries=5):
    req = urllib.request.Request(
        url, headers={"User-Agent": "hack-nation-atlas-data-agent/1.0 (mailto:research@example.org)"})
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(3 * (i + 1) + 1)


def epmc_search(term, page, page_size=50):
    q = f'SRC:PPR AND ({term}) AND {DATERANGE}'
    params = {"query": q, "format": "json", "resultType": "core",
              "pageSize": page_size, "page": page, "email": "research@example.org"}
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urllib.parse.urlencode(params)
    d = json.loads(get(url))
    return d.get("resultList", {}).get("result", [])


def server_for(doi):
    if not doi:
        return None
    for server in ("biorxiv", "medrxiv"):
        try:
            url = f"https://api.biorxiv.org/details/{server}/{urllib.parse.quote(doi)}"
            d = json.loads(get(url, retries=2))
            if d.get("collection"):
                return "bioRxiv" if server == "biorxiv" else "medRxiv"
        except Exception:
            pass
    return None


def norm_title(t):
    return re.sub(r"\s+", " ", (t or "").strip().lower())


def main():
    path = os.path.join(ROOT, "raw", "preprint_records.jsonl")
    recs = [json.loads(l) for l in open(path) if l.strip()]
    kept = [r for r in recs if r["journal"] in ("bioRxiv", "medRxiv")]
    dropped = len(recs) - len(kept)
    print(f"base: {len(recs)} -> {len(kept)} bioRxiv|medRxiv (dropped {dropped} other servers)")
    seen_ids = {r["pmid"] for r in kept}

    pub_path = os.path.join(ROOT, "raw", "pubmed_abstracts.jsonl")
    pub_set = set()
    with open(pub_path) as f:
        for line in f:
            line = line.strip()
            if line:
                pub_set.add(norm_title(json.loads(line).get("title", "")))
    kept_titles = [norm_title(r["title"]) for r in kept]

    entities = [("gene", g, f'"{g}"') for g in GENES]
    for label, term in DISEASES:
        entities.append(("disease", label, term))

    for etype, label, term in entities:
        if len(kept) >= TARGET:
            break
        hits = HITS.get(label, 0)
        if hits <= 25:
            continue
        pages = [2] if hits <= 50 else [2, 3]
        for page in pages:
            if len(kept) >= TARGET:
                break
            try:
                results = epmc_search(term, page)
            except Exception as e:
                print(f"{label} p{page}: FAILED {e}", flush=True)
                continue
            added = 0
            for r in results:
                if len(kept) >= TARGET:
                    break
                rid = r.get("id", "")
                if not rid or "PPR:" + rid in seen_ids:
                    continue
                title = (r.get("title") or "").strip()
                abstract = (r.get("abstractText") or "").strip()
                if not title or not abstract:
                    continue
                nt = norm_title(title)
                if nt in pub_set or any(SequenceMatcher(None, nt, pt).ratio() >= 0.92 for pt in pub_set):
                    continue
                if any(SequenceMatcher(None, nt, kt).ratio() >= 0.95 for kt in kept_titles):
                    continue
                j = server_for(r.get("doi"))
                time.sleep(0.2)
                if not j:
                    continue
                authors = [a.get("fullName", "") for a in
                           (r.get("authorList") or {}).get("author", []) if a.get("fullName")]
                year = str(r.get("pubYear") or (r.get("firstPublicationDate") or "")[:4])
                kept.append({"pmid": "PPR:" + rid, "title": title, "abstract": abstract,
                             "authors": authors[:8], "journal": j, "year": year,
                             "source": "bioRxiv/medRxiv (Europe PMC)", "retrieved": TODAY,
                             "query_entity": label, "entity_type": etype})
                seen_ids.add("PPR:" + rid)
                kept_titles.append(nt)
                added += 1
            print(f"{label} page {page}: +{added} (total {len(kept)})", flush=True)
            time.sleep(1.5)

    with open(path, "w") as fh:
        for r in kept:
            fh.write(json.dumps(r) + "\n")
    from collections import Counter
    print(f"FINAL: {len(kept)} records -> {path}")
    print("journals:", dict(Counter(r["journal"] for r in kept)))
    print("years:", dict(Counter(r["year"] for r in kept)))


if __name__ == "__main__":
    main()
