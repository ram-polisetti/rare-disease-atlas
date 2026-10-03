# Data Sources — Hack-Nation Rare Disease Atlas (LSD slice)

Retrieval date for all sources: **2026-10-03** (unless noted). Every record in `data/raw/` and `data/processed/` carries its `source` and `retrieved` fields for edge provenance in the graph build.

Slice: lysosomal storage diseases only. Genes: GBA, GLA, GAA, SMPD1, NPC1, NPC2, HEXA, HEXB, IDUA, GALC, ARSA. Diseases: Gaucher, Fabry, Pompe, Niemann-Pick A/B, Niemann-Pick C, Tay-Sachs, Sandhoff, MPS I, Krabbe, Metachromatic leukodystrophy.

## 1. MONDO / Monarch Initiative
- **Source:** Monarch Initiative Biolink API v3 — https://api-v3.monarchinitiative.org/v3/api/
  (`/association` endpoint, categories `biolink:CausalGeneToDiseaseAssociation` and `biolink:CorrelatedGeneToDiseaseAssociation`; `/entity/{MONDO:id}` for synonyms/xrefs)
- **Files:** `data/raw/monarch_gene_disease_associations.json` (raw), `data/raw/mondo.json` (full MONDO OBO-Graphs release, untouched), `data/processed/mondo_slice_diseases.json` (filtered slice: MONDO id, label, synonyms, xrefs, definition)
- **License:** CC0 (Monarch data). Note: gene symbol "GBA" resolves to the canonical NCBI symbol **GBA1** (HGNC:4177) — the Gaucher gene; "GBA" alone hit the GBA1LP pseudogene in Monarch search, so the pull maps GBA→GBA1.

## 2. Human Phenotype Ontology (HPO)
- **Source:** HPO releases — https://github.com/obophenotype/human-phenotype-ontology/releases (latest). `hp.json` (ontology), `phenotype.hpoa` (phenotype annotations). Note: the `https://hpo.jax.org/app/data/ontology` URL serves the web app HTML, not the data — use the GitHub release assets (or `https://purl.obolibrary.org/obo/hp.json`).
- **Files:** `data/raw/hp.json`, `data/raw/phenotype.hpoa` (raw); `data/processed/hpo_slice_phenotypes.json` (disease→phenotype edges: HP id, label, frequency, evidence, reference; diseases matched via OMIM/ORPHA xrefs from the MONDO slice)
- **License:** HPO is free for academic/non-commercial use (see https://hpo.jax.org/app/license).

## 3. ClinVar (NCBI)
- **Source:** NCBI E-utilities (esearch + esummary, db=clinvar) — https://www.ncbi.nlm.nih.gov/clinvar/; query per gene: `{GENE}[gene] AND ("pathogenic"[Clinical significance] OR "likely pathogenic"[Clinical significance])`
- **Files:** `data/raw/clinvar_variants.json` (all fetched, up to 80/gene), `data/processed/clinvar_slice_variants.json` (top 10 pathogenic per gene: ClinVar id, HGVS, significance, conditions, review status)
- **Rate limit:** ≤3 req/s (0.35s sleep between calls), per NCBI E-utilities policy.

## 4. PubMed (NCBI)
- **Source:** NCBI E-utilities (esearch + efetch, rettype=abstract, retmode=xml) — https://pubmed.ncbi.nlm.nih.gov/; per-entity queries (10 diseases + 11 genes), reviews preferred (`review[pt]`), up to 25 abstracts/entity
- **Files:** `data/raw/pubmed_abstracts.jsonl` (pmid, title, abstract, authors, journal, year, query_entity)
- **Rate limit:** ≤3 req/s (0.35s sleep between calls).

## 5. ClinicalTrials.gov
- **Source:** ClinicalTrials.gov API v2 — https://clinicaltrials.gov/api/v2/studies (queried per disease; statuses RECRUITING | ACTIVE_NOT_RECRUITING | NOT_YET_RECRUITING)
- **Files:** `data/raw/clinicaltrials.json` (NCT id, title, status, phase, conditions, interventions, locations count, sponsor, dates, URL)

## 6. Patient organizations (hand-curated, URLs verified 2026-10-03)
- **Source:** agent-curated list; each homepage fetched and `<title>` verified
- **File:** `data/raw/patient_orgs.json` (name, diseases served, URL, registries/assets, verification status)
- Orgs: National Gaucher Foundation (gaucherdisease.org; ICGG Gaucher Registry), Fabry Support & Information Group (fabry.org; Fabry Registry), NTSAD (ntsad.org; Tay-Sachs/Sandhoff), NNPDF (nnpdf.org; Niemann-Pick), INPDR (inpdr.org; NPC registry), AMDA (amda-pompe.org; Pompe Registry), National MPS Society (mpssociety.org), United Leukodystrophy Foundation (ulf.org; Krabbe/MLD), Hunter's Hope (huntershope.org; Krabbe newborn screening), NORD (rarediseases.org; umbrella)

## 7. Orphanet orphadata
- **Source:** `https://www.orphadata.com/data/xml/en_product6.xml` (genes associated with rare diseases; data release 2026-06-23; CC-BY 4.0) — downloaded in seconds, no login needed
- **Files:** `data/raw/orphanet_en_product6.xml` (raw, 22.6 MB), `data/processed/orphanet_slice_gene_disease.json` (37 slice gene→disease links: ORPHA id, disease, gene, association type, status)
