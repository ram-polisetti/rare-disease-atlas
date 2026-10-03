# Data Sources — Hack-Nation Rare Disease Atlas (LSD slice)

Retrieval date for all sources: **2026-10-03** (unless noted). Every record in `data/raw/` and `data/processed/` carries its `source` and `retrieved` fields for edge provenance in the graph build.

Slice: lysosomal storage diseases and curated gene-linked neighboring conditions. Genes: GBA, GLA, GAA, SMPD1, NPC1, NPC2, HEXA, HEXB, IDUA, GALC, ARSA, IDS, SGSH, NAGLU, HGSNAT, GNS. Diseases include Gaucher, Fabry, Pompe, Niemann-Pick A/B, Niemann-Pick C, Tay-Sachs, Sandhoff, MPS I/II/III A–D, Krabbe, Metachromatic leukodystrophy, and source-reported gene-linked neighbors.

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

## 8. MPS II / Sanfilippo expansion — retrieved 2026-10-03

- **Reproducible pull:** `scripts/expand_mps.py`; no model endpoints. Exact successful request URLs, resolved IDs, counts and failures are recorded in `data/processed/mps_expansion_report.json`.
- **MONDO:** local `data/raw/mondo.json`, originally from https://purl.obolibrary.org/obo/mondo.json. Extracted labels, all synonyms, xrefs and definitions for MPS II, severe/attenuated MPS II, MPS III and IIIA–D; also retained the Monarch-reported NAGLU/HGSNAT neighboring conditions. Local ontology files were unchanged.
- **Monarch:** https://api-v3.monarchinitiative.org/v3/api/search and https://api-v3.monarchinitiative.org/v3/api/association; exact symbol matching for IDS, SGSH, NAGLU, HGSNAT and GNS, causal and correlated categories, 100 results/category. Appended 15 associations and 5 resolved HGNC mappings without replacing prior records.
- **HPO:** https://github.com/obophenotype/human-phenotype-ontology/releases; re-filtered the existing local `phenotype.hpoa` using new MONDO OMIM/Orphanet xrefs, joining labels from unchanged `hp.json`. The five new disease annotations contain no `NOT` qualifiers.
- **PubMed:** https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi and https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi; queried SGSH, NAGLU, HGSNAT, GNS, IDS, mucopolysaccharidosis type III, Sanfilippo syndrome, Hunter syndrome and mucopolysaccharidosis type II. Reviews preferred, at most 25/entity; appended **120** records, skipping existing PMIDs. Total **598** records; the original 478-line prefix is unchanged. Same fields and parsing as `pull_pubmed.py`.
- **NCBI request policy:** all calls include `tool=rare-disease-atlas` and an `email` parameter, with at least 0.4 seconds between request starts (≤2.5 requests/second), sequential across PubMed and ClinVar. `NCBI_EMAIL` supplies a real coordinator contact when configured; this run used the explicit placeholder `rare-disease-atlas@example.org`, since no contact email was supplied. No email was sent.
- **ClinVar:** https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi and https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi; pathogenic/likely-pathogenic filters for each of the 5 genes, 80 records/gene, **400 appended**, 10/gene selected for the graph. Same record format as `pull_clinvar.py`. As in the original slice, its legacy summary parser leaves significance/conditions/review-status fields empty when absent under those field names; pathogenicity selection is supported by the source search filter, not a newly interpreted classification.
- **ClinicalTrials.gov:** https://clinicaltrials.gov/api/v2/studies; queries Mucopolysaccharidosis type II, IIIA, IIIB, IIIC and IIID; RECRUITING/ACTIVE_NOT_RECRUITING/NOT_YET_RECRUITING, pagination, NCT deduplication. **20 appended**, **199 total**. New records use the existing keys and read conditions from v2 `conditionsModule`; prior records are unchanged. `query_disease` remains the original pipeline's medium-confidence disease-mapping heuristic and does not establish subtype eligibility.
- **Natural-history protocols:** https://clinicaltrials.gov/api/v2/studies/NCT00144794 (MPS I Registry) and https://clinicaltrials.gov/api/v2/studies/NCT03292887 (Hunter Outcome Survey); complete public protocol records saved in new `data/raw/mps_registry_protocols.json`. Completed registries can inform design even though they are excluded by the active-trial slice filter. The graph asset includes source eligibility and six proposed adaptation checks. Public design reuse does not imply participant-data access or an agreed collaboration.
- **Patient organizations:** https://mpssociety.org/ (redirects to https://mpssociety.org/en/); existing National MPS Society node extended to MPS II and all III nodes as observed/high/manual advocacy links. Scanned existing org JSON and Orphanet product 6: no additional Sanfilippo/MPS-specific foundation found. Hunter's Hope remains linked to its documented Krabbe remit. Product 6 is a gene-association dataset, not a foundation directory.
- **Orphanet:** https://www.orphadata.com/data/xml/en_product6.xml; re-filtered unchanged local XML for the 5 genes and appended 8 processed associations. No additional raw download or replacement.

## 9. Regulatory verification for Maria — checked 2026-10-03

- **MPS IIIA claim corrected:** https://www.fda.gov/media/194921/download and https://www.fda.gov/vaccines-blood-biologics/fayuvi. FDA approved Fayuvi (rebisufligene etisparvovec-hopf) **2026-09-17** for neurologic manifestations in pediatric MPS IIIA patients with preserved neurodevelopmental function. The requested assertion of no FDA-approved disease-modifying treatment in October 2026 is contradicted and omitted.
- **Laronidase:** https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2003/larobio043003L.htm — Aldurazyme approved **2003-04-30** for specified MPS I forms; the letter says CNS manifestations were not evaluated.
- **Idursulfase:** https://purplebooksearch.fda.gov/index.cfm?blaNo=125151&event=productdetails — Elaprase initial FDA approval **2006-07-24**; MPS II indication also documented by https://www.sec.gov/Archives/edgar/data/936402/000095010306001827/dp03185_ex9901.htm (sponsor's contemporaneous announcement).
- **Miglustat:** https://www.ema.europa.eu/en/medicines/human/EPAR/zavesca (EU Gaucher type 1 and progressive neurological NPC indications) and https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=817892d1-ee12-4632-85fc-57ccdf16d7b8&type=display (US Zavesca indication: specified adults with Gaucher type 1; no NPC indication). Stored only as a cross-disease translation precedent in proposal metadata; no Sanfilippo treatment claim.
- **Unverified planning numbers:** the **2–3 years**, **~$500K+** and **2–6 weeks** are explicitly labeled hackathon estimates, with seven assumptions. No study-specific measured cost or guaranteed timeline was found or asserted. The estimated acceleration concerns a reviewed next-step plan, not completed follow-up, treatment approval or study launch.
- **Failures/fallbacks:** no requested public API source failed after network access was authorized. Three-attempt retries are available; this run's failure list is empty. No model endpoint was used.
