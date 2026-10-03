#!/usr/bin/env python3
"""Backfill journal (bioRxiv|medRxiv) in data/raw/preprint_records.jsonl.

For each record: Europe PMC id -> doi, then bioRxiv/medRxiv API DOI lookup.
"""
import json, os, time, urllib.request, urllib.parse

IN = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data/raw/preprint_records.jsonl")


def get(url, timeout=30, retries=3):
    req = urllib.request.Request(
        url, headers={"User-Agent": "hack-nation-atlas-data-agent/1.0 (mailto:research@example.org)"})
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(2 * (i + 1))


def doi_for(ppid):
    url = ("https://www.ebi.ac.uk/europepmc/webservices/rest/search?query="
           + urllib.parse.quote(f"EXT_ID:{ppid} AND SRC:PPR")
           + "&format=json&resultType=core&pageSize=1&email=research@example.org")
    d = json.loads(get(url))
    res = d.get("resultList", {}).get("result", [])
    return res[0].get("doi") if res else None


def server_for(doi):
    for server in ("biorxiv", "medrxiv"):
        try:
            url = f"https://api.biorxiv.org/details/{server}/{urllib.parse.quote(doi)}"
            d = json.loads(get(url))
            if d.get("collection"):
                return "bioRxiv" if server == "biorxiv" else "medRxiv"
        except Exception:
            pass
        time.sleep(0.2)
    return "preprint"


def main():
    recs = [json.loads(l) for l in open(IN) if l.strip()]
    counts = {}
    for r in recs:
        if r.get("journal") in ("bioRxiv", "medRxiv"):
            counts[r["journal"]] = counts.get(r["journal"], 0) + 1
            continue
        ppid = r["pmid"].split(":", 1)[1]
        try:
            doi = doi_for(ppid)
            j = server_for(doi) if doi else "preprint"
        except Exception as e:
            print(f"{ppid}: FAILED {e}", flush=True)
            j = "preprint"
        r["journal"] = j
        counts[j] = counts.get(j, 0) + 1
        print(f"{ppid}: {j} (doi={doi})", flush=True)
        time.sleep(1.2)
    with open(IN, "w") as fh:
        for r in recs:
            fh.write(json.dumps(r) + "\n")
    print("FINAL journals:", counts)


if __name__ == "__main__":
    main()
