# DRAFT — Technical video outline (3 minutes)
**Status: DRAFT — awaiting Charan's review. Nothing is recorded, narrated, or
treated as final without his explicit go-ahead.**

## 0:00–0:30 — The problem
Rare diseases are rare individually and common together: thousands of diseases,
each too small for its own registry or trial infrastructure. Lysosomal storage
diseases share biology (lysosomal catabolism pathways), so evidence built for
one should be reusable for another — but today it sits siloed in databases,
papers, and trial registries. We built a knowledge graph that pools it.

## 0:30–1:15 — Data pipeline
Three stages, all scripted and reproducible in `scripts/`:
1. **Pull** — public APIs only: MONDO/Monarch gene–disease associations, HPO
   disease–phenotype annotations, ClinVar pathogenic variants, Orphanet
   gene–disease links, ClinicalTrials.gov active trials, NIH RePORTER funding,
   hand-curated patient orgs with verified URLs, and FDA records for regulatory
   verification. Raw downloads are gitignored and re-pullable (`data/SOURCES.md`).
2. **Extract** — LLM extraction (7 batches over 598 PubMed abstracts plus
   bioRxiv/medRxiv preprint records) into subject–relation–object claims.
3. **Merge + build** — `build_graph.py` assembles the curated graph, merges
   verified LLM edges, runs Louvain clustering, writes cluster summaries, and
   traces a patient journey. [On screen: the pipeline diagram.]

## 1:15–2:00 — Grounded-extraction verification
Every extracted claim must carry a verbatim source quote — a case-insensitive
substring of the cited abstract. Paraphrases are rejected. Numbers from the run:
we extracted **949 claims**; **944 passed machine verification**
(`scripts/verify_quotes.py`, 100% coverage). Three were quarantined for
non-verbatim labels and **2 more removed** after Claude's semantic spot-check
(29 of 31 judged correct). A cross-model diff against Claude's independent
10-claim sample found no contradictions, only recall differences. Of the
verified claims, **106 resolved to graph entities and merged**; 808 were skipped
because their entities were not in the graph. We created no invented nodes.
Disagreements are preserved as `contradicts: true` edges, never suppressed.
[On screen: verification funnel graphic.]

## 2:00–2:35 — Graph stats
**1,546 nodes, 4,060 edges, 8 Louvain communities** (modularity 0.54). The mix:
850 phenotypes, 199 active trials, 160 variants, 103 researchers, 100 funding
records, 51 diseases, 48 reusable assets, 16 genes, 12 patient organizations,
7 mechanisms. Each edge carries 10 metadata fields — evidence type, confidence,
source database, reference, date — per `docs/GRAPH_SCHEMA.md`. Clusters are
interpreted as reuse units: shared mechanism, reusable assets, explicit gaps,
and one concrete next experiment each.

## 2:35–3:00 — Demo and close
[Screen-record the Sanfilippo click path: search → MPS IIIA → SGSH → GAG
catabolism neighbor → Maria's Journey stepper → Patient Action.] For families,
leads split into green "viable" (observed, high/medium confidence) and amber
"thin" (inferred or low). Close: every claim traceable to a quote, every
assumption stated. Live at ramcharan.co.network/rare-disease-atlas, source on
GitHub.
