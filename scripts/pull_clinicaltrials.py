#!/usr/bin/env python3
"""ClinicalTrials.gov API v2: recruiting/active trials per slice disease.
Saves: data/raw/clinicaltrials.json, data/processed/clinicaltrials_slice.json
"""
import json, time, urllib.request, urllib.parse, os
from datetime import date

TODAY = date.today().isoformat()
ROOT = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas/data")
BASE = "https://clinicaltrials.gov/api/v2/studies"

DISEASES = {
    "Gaucher disease": "Gaucher disease",
    "Fabry disease": "Fabry disease",
    "Pompe disease": "Pompe disease",
    "Niemann-Pick disease": "Niemann-Pick disease",
    "Tay-Sachs disease": "Tay-Sachs disease",
    "Sandhoff disease": "Sandhoff disease",
    "Mucopolysaccharidosis type I": "mucopolysaccharidosis type I",
    "Krabbe disease": "Krabbe disease",
    "Metachromatic leukodystrophy": "metachromatic leukodystrophy",
}

def get(params):
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "hack-nation-atlas-data-agent/1.0",
                                               "Accept": "application/json"})
    time.sleep(0.5)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)

def parse(study):
    ps = study.get("protocolSection", {})
    sm = ps.get("statusModule", {})
    ident = ps.get("identificationModule", {})
    design = ps.get("designModule", {})
    arms = ps.get("armsInterventionsModule", {})
    contacts = ps.get("contactsLocationsModule", {})
    sponsors = ps.get("sponsorCollaboratorsModule", {})
    nct = ident.get("nctId")
    return {
        "nct_id": nct,
        "title": ident.get("officialTitle") or ident.get("briefTitle"),
        "status": sm.get("overallStatus"),
        "phase": (design.get("phases") or []),
        "conditions": sm.get("conditions", []),
        "interventions": [{"type": i.get("type"), "name": i.get("name")}
                          for i in arms.get("interventions", [])],
        "locations_count": len(contacts.get("locations", []) or []),
        "lead_sponsor": (sponsors.get("leadSponsor") or {}).get("name"),
        "start_date": (sm.get("startDateStruct") or {}).get("date"),
        "completion_date": (sm.get("completionDateStruct") or {}).get("date"),
        "url": f"https://clinicaltrials.gov/study/{nct}" if nct else None,
        "source": "ClinicalTrials.gov API v2",
        "retrieved": TODAY,
    }

def main():
    all_trials, seen = [], set()
    for label, term in DISEASES.items():
        try:
            page, n = None, 0
            while True:
                params = {"query.cond": term,
                          "filter.overallStatus": "RECRUITING|ACTIVE_NOT_RECRUITING|NOT_YET_RECRUITING",
                          "pageSize": 100,
                          "fields": "NCTId,OfficialTitle,BriefTitle,OverallStatus,Phase,Condition,InterventionType,InterventionName,LocationCity,LeadSponsorName,StartDate,CompletionDate"}
                if page:
                    params["pageToken"] = page
                d = get(params)
                for s in d.get("studies", []):
                    p = parse(s)
                    if p["nct_id"] and p["nct_id"] not in seen:
                        seen.add(p["nct_id"])
                        p["query_disease"] = label
                        all_trials.append(p); n += 1
                page = d.get("nextPageToken")
                if not page or n > 400:
                    break
            print(f"{label}: {n} trials")
        except Exception as e:
            print(f"{label}: FAILED {e}")
    with open(f"{ROOT}/raw/clinicaltrials.json", "w") as f:
        json.dump({"source": "ClinicalTrials.gov API v2", "retrieved": TODAY,
                   "n_trials": len(all_trials), "trials": all_trials}, f, indent=1)
    print(f"saved {len(all_trials)} unique trials")

if __name__ == "__main__":
    main()
