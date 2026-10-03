
# Graph build log — Hack-Nation Challenge 05 (AI Atlas for Rare Diseases)

> Note: the "Phase 2 merge" entry below was a *synthetic test* of the merge pipeline
> (test claims, since removed). The real `llm_edges.json` had not appeared at
> finalization; a watchdog polls until 19:30 EDT 2026-10-03 (see Phase 2 status).

## Phase 2 merge (2026-10-03)
- Merged 1 LLM-extracted edges (source_db=PubMed, evidence=observed) from data/processed/llm_edges.json; skipped 2 unresolvable claims (no invented nodes).
- Re-ran Louvain + cluster summaries + Maria journey on the merged graph.

## What was built (2026-10-03, ~13:35–14:30 EDT)
`scripts/build_graph.py` (curated build + analysis) → `data/graph.json` — the single
graph↔UI contract file. Validated against `docs/GRAPH_SCHEMA.md`: every edge carries
source/target/relation/evidence/confidence/source_db/source_ref/date/note/contradicts;
every node carries id/type/label/synonyms/description/cluster_id/extra.

Final curated graph: **1,120 nodes, 2,819 edges, 9 Louvain clusters (modularity 0.5308),
1,434 synonyms, 9-step Maria journey**. `meta.llm_edges_merged = false` (extraction
agent's `llm_edges.json` not present at build time; Phase-2 merge armed via watchdog,
deadline 19:30 EDT).

Node inventory by type: phenotype 722, trial 179, variant 110, disease 40 (39 MONDO +
1 off-slice ORPHA:411602 hereditary late-onset Parkinson, kept per naming note),
researcher 34, gene 11, patient_org 10, mechanism 7, asset 7.

## Node/edge design decisions and why
- **Gene ids**: HGNC ids (`HGNC:4177`), label = display symbol (`GBA`), synonym `GBA1`
  per the naming note (HGVS/ClinVar strings read GBA1; same gene).
- **Disease–gene edges**: Monarch Biolink predicates mapped to relations
  (`biolink:causes` → `caused_by_variant_in`, `gene_associated_with_condition` →
  `associated_with_gene`, `contributes_to` → `susceptibility_factor_for`, medium
  confidence). Orphanet links mapped onto MONDO via Orphanet xrefs; the one off-slice
  link (GBA1 "Major susceptibility factor" → ORPHA:411602) kept as a legitimate
  beyond-one-disease edge.
- **`contradicts: true` edges (2)**: `HGNC:4177 —causal_for→ MONDO:0008199` (late-onset
  Parkinson) and `→ MONDO:0007488` (Lewy body dementia), both evidence=inferred,
  confidence=low, source_db=manual. These record the *disputed* claim that GBA1 is a
  causal Parkinson gene; the notes state the curated-DB consensus (OMIM:
  contributes_to; Orphanet: major susceptibility factor = risk modifier only).
  No invented facts: the edge is explicitly framed as "records the disputed claim,
  not the consensus."
- **Trials**: `query_disease` field used for trial→disease mapping (ClinicalTrials.gov
  `conditions` were empty in the slice). Title-mapped, so confidence=medium,
  evidence=observed, relation `studied_in`.
- **Mechanisms (7)**: root `lysosomal enzyme deficiency` + sphingolipid catabolism,
  GM2 ganglioside catabolism, glycogen metabolism, GAG catabolism, lysosomal lipid/
  cholesterol trafficking, lysosomal dysfunction in neurodegeneration. Disease→mechanism
  via causal gene (evidence=inferred, medium); GBA's primary mechanism is
  sphingolipid catabolism, with neurodegeneration as secondary — except Parkinson/LBD
  nodes, which are primary-framed as neurodegeneration (special-cased, since that is
  the biologically relevant frame there).
- **Disease–disease `shares_pathway`**: all pairs sharing a *primary* mechanism
  (164 edges, inferred/medium). This is what makes Gaucher→Fabry a one-hop
  mechanistic-neighbor path.
- **Researchers (34)**: first authors (top 2 per query entity) from the 478 PubMed
  abstracts, which carried `authors` fields. `authored_study_on`, observed/medium,
  source_ref `PMID:<id>`.
- **Assets (7)**: ICGG Gaucher Registry, Fabry Registry, Pompe Registry, INPDR,
  NORD IAMRARE, shared ERT trial designs, and a sourced cross-disease natural-history
  study proposal. Orgs link via `maintains_asset`; diseases via `reuses_asset`.
- **Cluster propagation**: non-subgraph nodes (trials, orgs, variants, researchers,
  mechanisms, assets) inherit the cluster of their primary linked disease; multi-linked
  assets vote. Root mechanism → majority cluster; proposal asset → ICGG's cluster.

## Louvain parameters and cluster interpretation
- `community_louvain.best_partition(resolution=1.0, random_state=42)` on the
  disease–gene–phenotype subgraph (773 nodes, 1,812 edges).
- Weights: disease–gene 6.0, disease–disease same-primary-mechanism 4.0,
  disease–phenotype 1.0. Rationale: mechanism defines the reuse story (trial designs,
  registries), phenotype overlap refines within it.
- Result: 9 clusters, modularity **0.5308** (good structure). Notable: Fabry split
  from Gaucher/NP-A/B despite sharing sphingolipid catabolism — its phenotype set is
  distinct enough that Louvain separated it (defensible; the `shares_pathway` edge
  still connects them). Krabbe+MLD merged (ARSA/GALC, leukodystrophy phenotypes).
  Parkinson/LBD split across clusters 0 (LBD, with Gaucher) and 8 (late-onset PD)
  — reflects GBA's dual mechanistic framing.
- Cluster summaries include: shared mechanism, member diseases, reusable assets,
  gaps (missing HPO annotations — e.g. all 5 NPC-C subtype nodes; missing trials;
  missing registries), and ONE concrete next experiment per cluster (biomarker
  panels, placebo-arm pooling, registry-based surrogate endpoints).

## Maria's journey
9 steps: Gaucher type I → lysosomal pathway → Fabry (neighbor) → Pompe (ERT
precedent) → National Gaucher Foundation → FSIG → ICGG Registry → shared ERT trial
designs → sourced cross-disease natural-history proposal. `ten_x_case` compares the
~10-year siloed registry ramp-up vs ~2-year shared-registry route (explicitly framed
as time-to-first-trial estimates, not guarantees); 5 explicit assumptions listed.

## What worked / didn't
- Worked: schema validation caught a real bug pre-ship (Gaucher→Fabry pathway missing
  because sorted() picked neurodegeneration as GBA's primary mechanism); fixed with
  order-preserving primary + Parkinson/LBD special case.
- Worked: refactor into `build_curated()` / `analyze()` + `_curated_intermediate.json`
  so Phase 2 can merge LLM edges and re-run analysis deterministically.
- Didn't (caught by test): intermediate snapshot was written before trials/orgs/assets
  were added (890 vs 1,120 nodes) — moved the write to end of `build_curated()`.
- Didn't: ClinVar slice has empty `clinical_significance` everywhere, so no real
  variant-significance conflicts to encode; `contradicts` is carried by the
  GBA1–Parkinson dispute instead.
- Merge script `scripts/merge_llm_edges.py` tested with synthetic claims: resolves
  subjects/objects via label+synonym lookup, adds edges as source_db=PubMed /
  evidence=observed / extractor confidence / note=quote≤200 chars; skips
  unresolvable claims (drugs like imiglucerase, unknown entities) without inventing
  nodes; re-runs full analysis; appends to this log. Test: 1 added, 2 skipped, all
  validation checks green.

## Phase 2 status
- `data/processed/llm_edges.json` was NOT present at finalization. A background
  watchdog polls every 10 min until 19:30 EDT 2026-10-03; on appearance it runs the
  merge + re-validation; on deadline it appends an omission note here. Graph as
  shipped is curated-only and fully valid without it.

## MPS II / Sanfilippo expansion (2026-10-03)
- Full curated rebuild: **1,120 → 1,353 nodes; 2,819 → 3,532 edges**. Louvain **9 → 7 communities**, modularity **0.5415** (resolution 1.0, seed 42). 1,847 search synonyms.
- Added five genes (IDS HGNC:5389; SGSH HGNC:10818; NAGLU HGNC:7632; HGSNAT HGNC:26527; GNS HGNC:4422), MPS II MONDO:0010674, IIIA MONDO:0009655, IIIB MONDO:0009656, IIIC MONDO:0009657, IIID MONDO:0009658. Kept severe/attenuated Hunter splits, the MPS III umbrella, and three source-reported NAGLU/HGSNAT neighboring disease nodes.
- Source append counts: Monarch 15 associations; ClinVar 400 records (50 graph variants); PubMed 120 unique new PMIDs (598 records total); ClinicalTrials 20 new trials (199 total). All API pulls succeeded. Existing raw JSON records, original PubMed prefix and immutable ontology/XML files passed preservation checks.
- Extended primary GAG/heparan-sulfate catabolism mapping (inferred/medium for the five new gene→mechanism edges), disease pathway neighbors, National MPS Society advocacy and merge aliases. No additional MPS-specific foundation found in org JSON or Orphanet product 6; Hunter’s Hope remains Krabbe-specific.
- New shared natural-history design asset cites NCT00144794 (MPS I Registry) and NCT03292887 (Hunter Outcome Survey), with source eligibility plus six explicit checks: diagnosis definitions, concurrent trials, treatment exposure, consent/capacity, age/development. Candidate reuse and collaboration remain inferred proposals; no data-access or organization agreement asserted. Proposal cluster follows the MPS study-design asset.
- Replaced Maria with eight steps: Sanfilippo A → SGSH → GAG catabolism → MPS I → MPS II → National MPS Society → shared MPS natural-history design → sourced collaboration proposal. Seven explicit assumptions; 2–3 years/~$500K+ and 2–6 weeks are estimates for planning, not guaranteed trial launch or longitudinal follow-up.
- **Medical correction:** no-approved-therapy assertion was contradicted by FDA’s September 17, 2026 Fayuvi approval for neurologic manifestations of pediatric MPS IIIA with preserved neurodevelopmental function (https://www.fda.gov/media/194921/download). Journey uses the verified approval. Laronidase 2003 and idursulfase 2006 approvals verified. Miglustat stored only as Gaucher→EU NPC translation precedent; no Sanfilippo treatment claim. Sources and limitations documented in data/SOURCES.md.
- Validation: scripts/validate_mps_graph.py passed contract fields/types, references, cluster membership, gene/disease IDs, variants, phenotypes, pathway pairs, advocacy, all adjacent journey links and raw preservation. Changed Python modules compile. No app/ or site/ edits; no commits; no model endpoints.
