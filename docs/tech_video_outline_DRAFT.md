# DRAFT: Technical video outline (about 3 minutes)

**Status: DRAFT, awaiting Charan's review. Charan records and narrates this himself. Nothing here is final without his go-ahead.**

Updated 2026-10-04 to match the deployed site and the current graph build.

## 0:00 to 0:25, the problem

Rare diseases are rare one at a time and common together. Lysosomal storage diseases share cellular machinery, so evidence built for one could be reused for another, but it sits in separate databases, papers, and trial registries. The atlas links it into one graph that a family or a researcher can read.

## 0:25 to 1:00, data pipeline

All scripted in `scripts/`, public sources only, retrieved 2026-10-03.

1. **Pull:** Mondo and gene-disease links from the Monarch API, HPO symptom annotations, ClinVar variants, Orphanet gene-disease links, ClinicalTrials.gov active trials, NIH RePORTER funding, PubMed and preprint abstracts, hand-curated patient organizations, and FDA records for treatment status.
2. **Extract:** an LLM turns abstracts into subject, relation, object claims. Each claim must carry a verbatim quote.
3. **Verify and merge:** `verify_quotes.py` string-matches every quote against its source; failures are quarantined. `build_graph.py` merges only claims whose entities already exist in the graph, so nothing is invented.

[On screen: pipeline diagram from the README.]

## 1:00 to 1:35, grounding and confidence

From the run: 949 claims extracted, 944 passed quote matching, 2 more removed after a semantic spot check, 106 merged. Every edge carries evidence type (observed or inferred), confidence, source database, reference, and date. The UI turns those into plain confidence badges in the Explore evidence panel. Disagreements are kept as contradiction edges and shown on the Contradictions tab.

[On screen: Explore, click an edge, show the evidence panel with quote and badge.]

## 1:35 to 2:05, graph and clusters

About 1,550 nodes and 4,150 edges across 51 diseases and 16 genes. Clusters use Louvain on a mechanism-only projection: funding, trial, and literature edges are excluded because an earlier run showed they lumped unrelated diseases together. Each cluster card says that shared mechanism does not mean a treatment transfers.

[On screen: Clusters tab.]

## 2:05 to 2:35, the analysis tabs

- **Endpoints:** curated endpoint definitions; disease membership computed at runtime from the graph (by gene for lab markers, by HPO symptom match for functional endpoints), shown as a sharing matrix. HPO-based rows are candidates, and the page says so.
- **What If:** a 51-disease picker over two scenarios, natural-history study and newborn-screening advocacy, built from graph queries with general knowledge labeled separately.
- **The 10x Case:** one modeled Sanfilippo A timeline, 5.5 years siloed against 2.2 years shared, with each phase and assumption listed. Modeled estimates, not measured results.

## 2:35 to 3:00, stack and close

Static site, plain JavaScript, vis-network vendored, one JSON file, no backend, no database, hosted on GitHub Pages. Reading levels (plain, standard, detailed), night mode, an accessibility panel, and print reports all run in the browser. Close: every claim traces to a source, every assumption is stated, and the pipeline can be pointed at the next disease family.

Live demo: https://ram-polisetti.github.io/rare-disease-atlas/

## Notes for recording

- Use "about" with node and edge counts; the build changes as fixes land.
- Say "modeled" with the 10x numbers every time.
- Mention that `docs/SCIENTIFIC_QA.md` lists the open copy corrections if asked about validation.
