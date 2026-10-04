# AI Atlas for the World's Rare Diseases

**Hack-Nation 7 — Challenge 05 submission.**
**Live demo:** https://ramcharan.co.network/rare-disease-atlas/

A quote-grounded knowledge graph of lysosomal storage diseases (LSDs) — genes,
variants, phenotypes, papers, trials, funding, patient organizations, mechanisms,
and a patient journey — browsable as a static single-page site. Every extracted
biomedical claim carries a verbatim source quote and provenance metadata.

The front door is a **parent guide**: a 4-step flow (role → search → narrow down →
one clear next step) that takes a worried parent from a typed symptom, gene, or
disease name to a printable clinician dossier — in plain language, with every
match shown and nothing hidden. Behind it sit 12 research tabs (Explore graph,
Clusters, Endpoints, What If, Contradictions, Gaps & Limits, Journey, and more),
all visible to everyone with no gates.

**Graph as built (2026-10-03):** 1,547 nodes, 4,065 edges, 8 Louvain communities
(modularity 0.55). Node mix: 850 phenotypes, 199 trials, 160 variants, 103
researchers, 100 funding records, 51 diseases, 48 reusable assets, 16 genes,
12 patient organizations, 7 mechanisms, 1 therapy (Fayuvi).

## Clustering methodology

Clusters are computed with Louvain (resolution 1.0, seed 42) on a
**mechanism-only weighted projection**: node types
{disease, gene, variant, phenotype, mechanism} and biological relations only.
Funding, patient-org, trial, literature, and authorship edges (1,337) are
excluded — an external architecture review showed they contaminate communities
with non-biological signal (the first clustering had lumped GBA/GLA/NPC1/NPC2/SMPD1
into one 605-member cluster via shared funding/literature edges). Edge weights:
mechanism/pathway relations x5/x3, gene–disease x2–3, phenotype x1, so the 2,057
`has_phenotype` edges do not drown the 73 mechanism edges. Result: all six
glycosaminoglycan-catabolism genes (GNS, HGSNAT, IDS, IDUA, NAGLU, SGSH)
co-cluster. Recompute: `scripts/recompute_mechanism_clusters.py`.

Every cluster card in the UI carries a limitation callout: shared mechanism does
**not** imply treatment transferability (e.g. MPS II's Elaprase does not cross
the blood–brain barrier, so it cannot treat Sanfilippo's CNS disease despite
shared heparan-sulfate buildup).

## Architecture

```
scripts/pull_*.py      →  data/raw/            (gitignored, ~185 MB; reproducible via data/SOURCES.md)
scripts/extract_*.py   →  data/processed/      (LLM extraction batches 0–6: PubMed + preprints)
scripts/verify_quotes.py → data/processed/llm_edges.json  (100% machine quote-matching; failures quarantined)
scripts/merge_*.py     →  data/_curated_intermediate.json
scripts/build_graph.py →  data/graph.json      (curated build + Louvain + cluster summaries + Maria's journey)
                           ↓ copied to
site/                  →  GitHub Pages         (vanilla JS + vis-network CDN; no build step)
```

- **Pull:** public APIs only — MONDO/Monarch Biolink v3, HPO releases, ClinVar
  (NCBI E-utilities), Orphanet orphadata, ClinicalTrials.gov v2, PubMed
  (reviews preferred), NIH RePORTER, plus hand-curated patient orgs (URLs verified).
- **Extract:** Codex LLM batches over 598 PubMed abstracts + preprint records.
  Every claim requires a **verbatim** `source_quote` (whitespace-normalized,
  case-insensitive substring of title+abstract); subject/object labels must appear
  in the source text. Paraphrase and fuzzy quotes are rejected.
- **Verify:** `scripts/verify_quotes.py` string-matches 100% of quotes; failures are
  quarantined to `data/processed/llm_edges_failed.json` and never merged. Claude
  then semantic-spot-checks a sample.
- **Build:** `scripts/build_graph.py` assembles the curated graph
  (`data/_curated_intermediate.json`), merges verified LLM edges, resolves entities
  by label+synonym (unresolvable claims are skipped — no invented nodes), runs
  Louvain (resolution 1.0, seed 42) on the disease–gene–phenotype subgraph, writes
  cluster summaries, and traces Maria's 8-step Sanfilippo A journey. The result is
  the single UI contract in `docs/GRAPH_SCHEMA.md`.
- **Serve:** `site/` is a static copy — the **Guide** (4-step parent flow:
  role → search by name/gene/symptom → narrow down → one clear next step with a
  printable dossier), **Your Disease**, **Journey**, **What's New**, **Gaps & Limits**,
  **Contradictions** (red "shown, never hidden" cards), **Explore** (search + 1/2-hop
  graph with click detail panel), **Clusters** (reusable-mechanism cards),
  **Endpoints**, **What If**, **Path to the Next Milestone**, and **Settings**.
  Vanilla JS + vis-network CDN; no build step.

## Parent guide (the front door)

Built for stressed parents with no medical background — medically serious, calm,
and simple:

- **Plain-language symptoms everywhere.** HPO labels are clinician jargon
  ("Dysarthria", "Splenomegaly"); the guide shows "Slurred or unclear speech",
  "Enlarged spleen", etc., via a curated dictionary. Lab findings and
  inheritance patterns never appear as things a parent is asked to recognize.
- **Every match shown, nothing hidden.** A search lists *all* matching
  conditions — no top-4/top-6 cap. The 20 most telling symptoms become an inline
  checklist; ticking re-ranks the list live with "Matches X of Y you picked"
  badges, and a banner names the closest match in the data. Non-matching
  candidates stay listed so nothing is missed.
- **Side-by-side comparison.** "Symptoms they share (why they can be confused)"
  plus per-condition "Only this one, in our data" differentiators.
- **One continuous thread.** Symptoms picked while narrowing carry into the
  confirmation step (never re-ticked) and into the printed dossier's
  "How you got here" section, so a clinician sees what the parent already
  considered. The confirmation step is skippable.
- **Honesty guardrails.** "Only a clinician can diagnose" throughout; observed
  vs inferred relationships stay separate; shared biology never implies
  treatment transfer.

Edge metadata (per `docs/GRAPH_SCHEMA.md`): every edge carries source, target,
relation, evidence (observed/inferred), confidence (high/medium/low), source_db,
source_ref (PMID/NCT/URL), date, note, and contradicts. Contradictions are
preserved, never suppressed (2 `contradicts: true` edges record the disputed
GBA1–Parkinson causal claim against the curated-DB consensus).

## Reproduce the dataset

1. Clone and create a Python 3.12 venv (`pip install` the imports used in
   `scripts/`: requests, networkx, python-louvain, streamlit for `app/`).
2. Run the pull scripts in dependency order: `scripts/pull_monarch.py`,
   `scripts/pull_pubmed.py`, `scripts/pull_clinvar.py`, `scripts/pull_clinicaltrials.py`,
   `scripts/pull_preprints.py`, `scripts/pull_reporter.py`, `scripts/pull_orgs.py`,
   `scripts/expand_mps.py` (Sanfilippo/MPS II slice). All use public APIs; see
   `data/SOURCES.md` for exact URLs, request policies, and known gotchas
   (e.g. GBA → GBA1 symbol mapping; HPO data lives on GitHub releases, not hpo.jax.org).
3. Extract: follow `docs/EXTRACTION_BRIEF.md` to produce claim batches in
   `data/processed/extract_batch_*.jsonl`, then `scripts/extract_llm_edges.py`.
4. Verify: `scripts/verify_quotes.py` → merged verified claims; spot-check with
   `scripts/claude_spotcheck.py`.
5. Merge: `scripts/merge_graph.py`, `scripts/merge_additions.py`,
   `scripts/merge_llm_edges.py`; then `scripts/build_graph.py`.
6. Copy `data/graph.json` → `site/graph.json` and deploy the static site.

`data/raw/` is gitignored; full reproduction re-pulls from public APIs (retrieval
date for all sources: 2026-10-03).

## Data sources

| Source | Used for | Retrieval |
|---|---|---|
| MONDO / Monarch Biolink API v3 | gene–disease associations (59 → 39 diseases), synonyms/xrefs | 2026-10-03 |
| Human Phenotype Ontology (hp.json, phenotype.hpoa, GitHub releases) | disease→phenotype edges (2,057), matched via OMIM/ORPHA xrefs | 2026-10-03 |
| ClinVar (NCBI E-utilities) | pathogenic/likely-pathogenic variants, top 10/gene (160 graph variants) | 2026-10-03 |
| Orphanet orphadata en_product6 (CC-BY 4.0, release 2026-06-23) | gene–disease links (44 edges; one off-slice Parkinson link kept, flagged) | 2026-10-03 |
| ClinicalTrials.gov API v2 | active trials: RECRUITING / ACTIVE_NOT_RECRUITING / NOT_YET_RECRUITING (199) | 2026-10-03 |
| PubMed (NCBI E-utilities, reviews preferred) | 598 abstracts → grounded LLM claim extraction | 2026-10-03 |
| bioRxiv / medRxiv | preprint records → extraction batch 6 (124 claims) | 2026-10-03 |
| NIH RePORTER | funding records (100 nodes, 363 edges) | 2026-10-03 |
| Patient organizations (hand-curated; 12 incl. National MPS Society, EURORDIS, Cure Sanfilippo Foundation) | advocacy links, registries, assets; each URL verified | 2026-10-03 |
| FDA (fda.gov, Drugs@FDA, DailyMed) | regulatory verification: Fayuvi approval 2026-09-17 (MPS IIIA); laronidase 2003; idursulfase 2006 | 2026-10-03 |

## Verification summary

- **949 claims extracted** across 7 LLM batches; **944 machine quote-verified**
  (100% string-matched against source text). 3 quarantined for non-verbatim
  labels; 5 rejected as ungrounded entities/quotes in offline pipeline tests.
- **Claude semantic spot-check:** 29/31 judged YES; the **2 removed** after
  failing semantic review. Cross-model diff (Claude's independent 10-claim
  sample): no contradictions, only recall differences.
- **106 verified edges merged** into the graph; 808 claims skipped as unresolvable
  (subjects/objects not in the graph — no invented nodes).
- 2 `contradicts: true` edges keep a disputed claim visible alongside consensus.

## Known limitations

- **OMIM excluded** (API key required). ClinVar + Monarch + Orphanet serve as
  variant and gene–disease surrogates.
- Trial→disease mapping uses the title-mapped `query_disease` heuristic
  (medium confidence); ClinicalTrials.gov `conditions` were empty in this slice.
- LLM claims are quote-grounded literature pointers, not medical guidance.
  Preprint-sourced claims are flagged by source and carry higher uncertainty.
- Journey estimates (2–3 years, ~$500K+, 2–6 weeks) are hackathon planning
  estimates with stated assumptions, not validated budgets or timelines.
- **Maria is a composite family advocate, not a real patient;** the National MPS
  Society has not agreed to the proposed natural-history collaboration.
- **Fayuvi pivot:** the journey's original "no FDA-approved therapy" assertion
  was contradicted during verification — FDA approved Fayuvi (rebisufligene
  etisparvovec-hopf) on 2026-09-17 for neurologic manifestations in pediatric
  MPS IIIA with preserved neurodevelopmental function. The journey uses the
  verified approval.

## Repo structure

```
app/            Streamlit dev UI (contract-verified; not the deployed demo)
data/           SOURCES.md (provenance), processed/, graph.json (the build artifact)
docs/           GRAPH_SCHEMA.md, EXTRACTION_BRIEF.md, UI_BRIEF.md,
                log_fragments/ (per-phase provenance), video scripts (drafts)
scripts/        pull_* → extract_* → verify → merge_* → build_graph.py
site/           deployed static demo (index.html, app.js, graph.json, vendor/)
```
