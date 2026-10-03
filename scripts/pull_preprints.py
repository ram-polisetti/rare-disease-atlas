#!/usr/bin/env python3
"""bioRxiv/medRxiv preprint pull for the Hack-Nation rare-disease atlas (batch 6).

Sources: Europe PMC REST (SRC:PPR index), date window 2024-01-01..2026-10-03.
Journal (bioRxiv|medRxiv) resolved via Crossref container-title per DOI.

Dedupe:
  - by Europe PMC id
  - by normalized title against data/raw/pubmed_abstracts.jsonl (exact + difflib>=0.9)
  - by normalized title within this pull (keep first)

Writes: data/raw/preprint_records.jsonl
Record shape matches pubmed_abstracts.jsonl:
  {"pmid": "PPR:<europepmc-id>", "title", "abstract", "authors", "journal",
   "year", "source": "bioRxiv/medRxiv (Europe PMC)", "retrieved",
   "query_entity", "entity_type"}
"""
import json, os, re, time, urllib.request, urllib.parse
from difflib import SequenceMatcher

ROOT = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data")
TODAY = "2026-10-03"
DATERANGE = "FIRST_PDATE:[2024-01-01 TO 2026-10-03]"

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
MAX_TOTAL = 100


def get(url, timeout=60, retries=5):
    req = urllib.request.Request(
        url, headers={"User-Agent": "hack-nation-atlas-data-agent/1.0 (mailto:research@example.org)"})
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if i == retries - 1:
                raise
            time.sleep(3 * (i + 1) + 1)  # backoff on throttle/conn reset


def epmc_search(term, page_size=25):
    q = f'SRC:PPR AND ({term}) AND {DATERANGE}'
    params = {"query": q, "format": "json", "resultType": "core",
              "pageSize": page_size, "email": "research@example.org"}
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urllib.parse.urlencode(params)
    d = json.loads(get(url))
    return d.get("resultList", {}).get("result", []), d.get("hitCount", 0)


_crossref_cache = {}


def resolve_journal(doi):
    if not doi:
        return "preprint"
    if doi in _crossref_cache:
        return _crossref_cache[doi]
    try:
        url = "https://api.crossref.org/works/" + urllib.parse.quote(doi)
        d = json.loads(get(url))
        ct = (d.get("message", {}).get("container-title") or [""])[0].lower()
        if "biorxiv" in ct:
            j = "bioRxiv"
        elif "medrxiv" in ct:
            j = "medRxiv"
        else:
            j = "preprint"
    except Exception:
        j = "preprint"
    _crossref_cache[doi] = j
    time.sleep(0.3)
    return j


def norm_title(t):
    return re.sub(r"\s+", " ", (t or "").strip().lower())


def main():
    # per-entity candidate lists
    entities = [("gene", g, f'"{g}"') for g in GENES]
    for label, term in DISEASES:
        entities.append(("disease", label, term))

    by_entity = []
    seen_ids = set()
    for etype, label, term in entities:
        try:
            results, hits = epmc_search(term)
            recs = []
            for r in results:
                rid = r.get("id", "")
                if not rid or rid in seen_ids:
                    continue
                seen_ids.add(rid)
                title = (r.get("title") or "").strip()
                abstract = (r.get("abstractText") or "").strip()
                if not title or not abstract:
                    continue
                authors = [a.get("fullName", "") for a in
                           (r.get("authorList") or {}).get("author", []) if a.get("fullName")]
                year = str(r.get("pubYear") or (r.get("firstPublicationDate") or "")[:4])
                journal = resolve_journal(r.get("doi") or "")
                recs.append({
                    "pmid": "PPR:" + rid,
                    "title": title, "abstract": abstract,
                    "authors": authors[:8], "journal": journal, "year": year,
                    "source": "bioRxiv/medRxiv (Europe PMC)", "retrieved": TODAY,
                    "query_entity": label, "entity_type": etype,
                })
            print(f"{label}: hits={hits} kept={len(recs)}", flush=True)
            by_entity.append(recs)
        except Exception as e:
            print(f"{label}: FAILED {e}", flush=True)
            by_entity.append([])
        time.sleep(1.5)

    # interleave round-robin for diversity, cap at MAX_TOTAL
    merged = []
    idx = [0] * len(by_entity)
    while len(merged) < MAX_TOTAL:
        progressed = False
        for i, recs in enumerate(by_entity):
            if idx[i] < len(recs) and len(merged) < MAX_TOTAL:
                merged.append(recs[idx[i]])
                idx[i] += 1
                progressed = True
        if not progressed:
            break
    print(f"pooled {len(merged)} records before pubmed-title dedupe")

    # dedupe vs pubmed titles
    pub_titles = []
    pub_path = os.path.join(ROOT, "raw", "pubmed_abstracts.jsonl")
    with open(pub_path) as f:
        for line in f:
            line = line.strip()
            if line:
                pub_titles.append(norm_title(json.loads(line).get("title", "")))
    pub_set = set(pub_titles)

    kept, dropped_title_dup = [], 0
    kept_titles = []
    for r in merged:
        nt = norm_title(r["title"])
        if nt in pub_set:
            dropped_title_dup += 1
            continue
        if any(SequenceMatcher(None, nt, pt).ratio() >= 0.92 for pt in pub_set):
            dropped_title_dup += 1
            continue
        if any(SequenceMatcher(None, nt, kt).ratio() >= 0.95 for kt in kept_titles):
            dropped_title_dup += 1
            continue
        kept.append(r)
        kept_titles.append(nt)

    os.makedirs(os.path.join(ROOT, "raw"), exist_ok=True)
    out = os.path.join(ROOT, "raw", "preprint_records.jsonl")
    with open(out, "w") as fh:
        for r in kept:
            fh.write(json.dumps(r) + "\n")
    journals = {}
    for r in kept:
        journals[r["journal"]] = journals.get(r["journal"], 0) + 1
    print(f"kept {len(kept)} records (dropped {dropped_title_dup} title-dups) -> {out}")
    print("journals:", journals)


if __name__ == "__main__":
    main()
