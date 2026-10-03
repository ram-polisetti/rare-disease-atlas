# Data pull log fragment — 2026-10-03 (~13:25–14:00 EDT)

Task: pull REAL data (never synthetic) for the lysosomal-storage-disease slice into `~/workspace/hack-nation-rare-disease-atlas/data/`. All work via `~/workspace/.venv/bin/python` (3.12), scripts in `~/workspace/hack-nation-rare-disease-atlas/scripts/`.

## What was done (in task order)

1. **MONDO / Monarch.** Skipped the giant release download at first (task allowed the Biolink API fallback), but it turned out fast — pulled the full `mondo.json` release (~107 MB, valid OBO-Graphs, 63,962 nodes) in the background anyway. Primary slice built from the Monarch Biolink v3 API (`https://api-v3.monarchinitiative.org/v3/api/`): `/association` with categories `biolink:CausalGeneToDiseaseAssociation` + `biolink:CorrelatedGeneToDiseaseAssociation` per gene, `/entity/{id}` for disease label/synonyms/xrefs/definition. Outputs: `raw/mondo.json`, `raw/monarch_gene_disease_associations.json`, `processed/mondo_slice_diseases.json`.
2. **HPO.** The task-listed URL `https://hpo.jax.org/app/data/ontology` serves the SPA HTML, not data (first download was an HTML error page — caught by checking `head`, killed and re-downloaded). Working URLs: `https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/hp.json` and `/phenotype.hpoa`. Outputs: `raw/hp.json` (20,532 nodes), `raw/phenotype.hpoa` (286,652 annotation rows), `processed/hpo_slice_phenotypes.json` — diseases matched to hpoa rows via OMIM/ORPHA xrefs taken from the MONDO slice entities.
3. **ClinVar.** NCBI E-utilities esearch `"{GENE}[gene] AND (\"pathogenic\"[Clinical significance] OR \"likely pathogenic\"[Clinical significance])"` + esummary, 0.35 s sleep between calls (≤3 req/s). Outputs: `raw/clinvar_variants.json`, `processed/clinvar_slice_variants.json` (top-10 pathogenic/gene, ranked pathogenic before likely-pathogenic).
4. **Monarch gene-disease.** Same as #1 (association endpoint) — 59 unique associations across 11 genes → 39 MONDO diseases.
5. **PubMed.** E-utilities esearch (reviews preferred via `review[pt]`, fall back to relevance) + efetch abstract XML, ≤25/entity for 10 diseases + 11 genes. Output: `raw/pubmed_abstracts.jsonl` (pmid, title, abstract, authors, journal, year, query_entity).
6. **ClinicalTrials.gov.** API v2 `https://clinicaltrials.gov/api/v2/studies` with `query.cond` per disease, `filter.overallStatus=RECRUITING|ACTIVE_NOT_RECRUITING|NOT_YET_RECRUITING`, paginated. Output: `raw/clinicaltrials.json` (NCT id, title, status, phase, conditions, interventions, locations count, sponsor, dates, URL).
7. **Patient orgs.** Hand-curated 10 orgs covering all 10 slice diseases; each URL verified by fetching the homepage and reading `<title>` — all 10 OK. Output: `raw/patient_orgs.json`. Orphadata en_product6.xml fetch attempted with a 150 s cap — outcome noted below.

## Decisions and why

- **GBA → GBA1 mapping.** Monarch `/search?q=GBA` resolved to the GBA1LP pseudogene (HGNC:4178), and ClinVar `GBA[gene]` returned 0 pathogenic records. NCBI's canonical symbol for the Gaucher gene is **GBA1** (HGNC:4177). Fixed with an explicit alias (`SYMBOL_ALIASES = {"GBA": "GBA1"}`) plus strict exact-name matching in `resolve_gene` (the first version had an `or id.startswith("HGNC")` bug that accepted the first HGNC hit). Re-ran the Monarch pull after the fix: GBA associations grew from 4 → 9. Display label stays "GBA" per the slice spec; HGVS strings will read GBA1 (same gene).
- **Biolink category enum.** `/association` rejects `biolink:GeneToDiseaseAssociation`; the valid enums are `biolink:CausalGeneToDiseaseAssociation` / `biolink:CorrelatedGeneToDiseaseAssociation`. Also the `predicate=biolink:causes` filter worked on the first probe. Queried both categories without predicate restriction, deduped on (subject, predicate, object).
- **Review-first PubMed strategy.** `review[pt]` filter for reviews, backfilled with relevance-ranked articles when <10 hits — reviews are the best raw material for an atlas.
- **HPO matching via xrefs, not names.** hpoa column 0 uses OMIM:/ORPHA: ids, so rows were matched via the MONDO slice entities' xrefs (58 OMIM/ORPHA ids → 39 diseases), with labels joined from hp.json nodes. 31/39 diseases got phenotype edges.
- **Trials status filter.** Kept RECRUITING + ACTIVE_NOT_RECRUITING + NOT_YET_RECRUITING only (recruiting/active per task); deduped by NCT across the 9 disease queries.

## What worked / what didn't

- Worked: Monarch API (fast, no key), ClinicalTrials.gov v2 (clean pagination), HPO GitHub release assets, patient-org homepage verification (10/10 first try), full mondo.json release download (~107 MB in <1 min).
- Didn't work: `hpo.jax.org/app/data/ontology` URL (returns SPA HTML) — fixed via GitHub release assets; Monarch search gene-symbol resolution for "GBA" (pseudogene hit) — fixed with alias + strict match; ClinVar `GBA[gene]` → 0 hits — fixed with `GBA1[gene]`.

## Exact commands / URLs

- `curl -sL -o mondo.json https://github.com/monarch-initiative/mondo/releases/latest/download/mondo.json`
- `curl -sL -o hp.json https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/hp.json`
- `curl -sL -o phenotype.hpoa https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/phenotype.hpoa`
- `curl -s "https://api-v3.monarchinitiative.org/v3/api/association?subject=HGNC%3A4177&category=biolink%3ACausalGeneToDiseaseAssociation&predicate=biolink%3Acauses&limit=5"`
- E-utilities: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/{esearch,esummary,efetch}.fcgi` (0.35 s sleeps; no API key needed at ≤3/s)
- `https://clinicaltrials.gov/api/v2/studies?query.cond=...&filter.overallStatus=RECRUITING|ACTIVE_NOT_RECRUITING|NOT_YET_RECRUITING`
- `curl -sL --max-time 150 -o en_product6.xml https://www.orphadata.com/data/xml/en_product6.xml`

## Record counts (retrieved 2026-10-03)

| Source | Count |
|---|---|
| Monarch gene→disease associations (unique) | 59 across 11 genes → 39 MONDO diseases |
| MONDO slice disease entities (label/synonyms/xrefs) | 39 |
| HPO phenotype edges (disease→HP) | 1,792 across 31 diseases |
| ClinVar pathogenic/likely-pathogenic variants (raw) | 880 (80/gene × 11); top-10 per gene in processed |
| PubMed abstracts | 478 (25/entity target; HEXB 15, IDUA 21 — fewer reviews exist) |
| ClinicalTrials.gov trials (unique NCT) | 179 (Fabry 54, Pompe 41, Gaucher 40, Niemann-Pick 16, MPS I 13, Tay-Sachs 6, MLD 5, Krabbe 3, Sandhoff 1) |
| Patient orgs (hand-curated, URL-verified) | 10 |
| Orphanet gene→disease links (slice) | 37 |

## Orphadata note

The en_product6.xml download succeeded in seconds (22.6 MB, no login needed): `data/raw/orphanet_en_product6.xml`. Slice links extracted to `data/processed/orphanet_slice_gene_disease.json` (37 links; note one off-slice hit — ORPHA:411602 hereditary late-onset Parkinson disease where GBA1 is a "major susceptibility factor", kept with its association type so the graph builder can filter).
