# AI Atlas for Rare Diseases

Hack-Nation Challenge 05 entry by Charan Polisetti.

**Live demo:** https://ram-polisetti.github.io/rare-disease-atlas/

The atlas is a static website built on a knowledge graph of 51 lysosomal storage diseases. It links each disease to its genes, ClinVar variants, HPO symptoms, active clinical trials, research funding, patient organizations, reusable study designs, and the published claims behind those links. Every link records where it came from and how strong the evidence is.

It is written for two kinds of reader. The first is a parent or patient who has a symptom list or a new diagnosis and needs to know what it means and what to do next. The second is a researcher, advocate, or trial designer looking for diseases that share biology or measurements, so that work done for one community can be reused by another.

It is not a diagnostic tool. The site says so on every page where it matters, and it never states that a disease has no treatment unless that is verified.

## The 11 tabs

| Tab | What it does |
|---|---|
| **Guide** | The front door. Describe a symptom, gene, or diagnosis in your own words. A "You asked / We understood" trail shows how the search was read. Symptom checkboxes narrow the matching conditions live, nothing is hidden, and the result ends in one clear next step and a printable summary for a clinician. |
| **Your Disease** | Everything the atlas records about one condition: genes, symptoms, treatment status, trials, and patient groups. |
| **Journey** | The path families usually walk (diagnosis uncertain, diagnosis confirmed, and so on), with the next two or three steps drawn from this disease's actual data, including honest dead ends. |
| **What's New** | The newest research and trials added to the atlas. |
| **Gaps & Limits** | Where the atlas is thin or silent, with the exact references, so readers can see what is missing. |
| **Contradictions** | Places where sources disagree, shown side by side and never hidden (for example, the disputed GBA1 and Parkinson's causal claim). |
| **Explore** | Search the full graph. Click any node to see its connections and an evidence panel with the source, quote, evidence type, and a confidence badge for each link. |
| **Clusters** | Diseases that break the same cellular machinery, grouped by a mechanism-only clustering. Each card warns that shared mechanism does not mean a treatment transfers. |
| **Endpoints** | What trials measure, and which diseases could measure the same thing. A sharing matrix shows disease groups against endpoints, with each cell traced to graph data or labeled as a candidate that needs validation. |
| **What If** | Pick any of the 51 diseases and explore two strategies: starting a natural-history study, or advocating for newborn screening. Shows collaborators, trials, patient groups, and gaps from the graph, and labels anything that is general knowledge rather than graph data. |
| **The 10x Case** | One worked, modeled example for Sanfilippo A (MPS IIIA): a siloed natural-history study at about 5.5 years against about 2.2 years for a shared, cross-subtype design. These are modeled estimates, not measured results, and every assumption is listed. |

Site-wide controls: a reading-level switch (plain language, standard, detailed), night mode, an accessibility panel (text spacing, reduced motion, focus mode, text size), and print-friendly reports. The theme is charcoal gray.

## Data sources

All retrieved on 2026-10-03 from public sources. Full URLs and request notes are in `data/SOURCES.md`.

| Source | Used for |
|---|---|
| Mondo, via the Monarch Initiative API v3 | disease identity, gene-disease associations, synonyms |
| Human Phenotype Ontology (hp.json, phenotype.hpoa) | disease-symptom links |
| ClinVar (NCBI E-utilities) | pathogenic and likely pathogenic variants |
| Orphanet orphadata (CC BY 4.0) | curated gene-disease links |
| ClinicalTrials.gov API v2 | recruiting and active trials |
| PubMed and bioRxiv/medRxiv | abstracts used for quote-grounded claim extraction |
| NIH RePORTER | research funding records |
| Patient organizations (hand-curated) | advocacy groups, registries; each URL checked |
| FDA (labels, Drugs@FDA) | treatment status, including Fayuvi's approval on 2026-09-17 |

OMIM is not used because its API needs a license key.

## Method

**Knowledge graph.** About 1,550 nodes and 4,150 edges in the current build. Node types are disease, gene, variant, phenotype, mechanism, therapy, trial, funding, researcher, patient organization, and reusable asset. Literature claims are stored as edges, each carrying its source quote. The schema is in `docs/GRAPH_SCHEMA.md`.

**Grounded claims.** Literature claims were extracted by an LLM from PubMed abstracts and preprints. Each claim had to come with a verbatim quote from the source, and `scripts/verify_quotes.py` string-matches every quote against the source text. Claims that fail are quarantined and never merged. Claims whose subject or object could not be matched to an existing node are skipped, so no node is invented. A sample was then checked for meaning by a second model (Claude), and the two claims that failed were removed.

**Confidence badges.** Every edge carries `evidence` (observed or inferred), `confidence` (high, medium, low), `source_db`, `source_ref`, and a date. The UI turns these into plain labels: "stated directly by a curated medical database", "directly stated in published research", "a suggestion from analysis, not yet proven in a study", or "contested". Contradicting edges are kept and flagged.

**Clusters.** Louvain community detection (resolution 1.0, seed 42) on a mechanism-only projection of the graph: diseases, genes, variants, phenotypes, and mechanisms, with biological relations only. Funding, trial, literature, and authorship edges are excluded because an earlier run showed they pull unrelated diseases together.

**Endpoints.** Endpoint definitions are curated. Which diseases appear under each endpoint is computed at runtime from the graph: by gene for the lab markers, and by keyword match on HPO symptoms for functional and imaging endpoints. The HPO-based rows mean "this disease has a recorded symptom in this area", not "this disease is measured this way in trials". The page repeats the rule that matters most: sharing a measurement is not sharing biology.

## Reproducing the graph

`site/graph.json` is a copy of `data/graph.json`, which is built by the scripts in `scripts/`.

1. Create a Python 3.12 virtual environment and install `requests`, `networkx`, and `python-louvain`.
2. Pull sources: `pull_monarch.py`, `filter_hpo.py`, `pull_clinvar.py`, `pull_clinicaltrials.py`, `pull_pubmed.py`, `pull_preprints.py`, `pull_reporter.py`, `pull_orgs.py`, then `expand_mps.py` for the Sanfilippo and MPS II slice. Raw data goes to `data/raw/` (gitignored, about 185 MB).
3. Extract claims following `docs/EXTRACTION_BRIEF.md`, then run `extract_llm_edges.py` and `extract_preprint_edges.py`.
4. Verify with `verify_quotes.py`. Optional spot check with `claude_spotcheck.py`.
5. Merge with `merge_graph.py`, `merge_additions.py`, and `merge_llm_edges.py`, then build with `build_graph.py`. Recompute clusters with `recompute_mechanism_clusters.py`. Validate the MPS slice with `validate_mps_graph.py`.
6. Copy `data/graph.json` to `site/graph.json`.

To run the site locally: `cd site && python3 -m http.server 8000`, then open http://localhost:8000.

## Tech stack

A static site: plain HTML, CSS, and JavaScript, with vis-network vendored in `site/vendor/` for the graph view. There is no backend, no database, no build step, and no tracking. The whole graph ships as one JSON file and all queries run in the browser. It is hosted on GitHub Pages. The data pipeline is Python. `app/` holds an older Streamlit development UI that is not part of the deployed site.

## Known limitations

- The slice covers lysosomal storage diseases only (51 diseases, 16 genes).
- Treatment coverage is partial. The graph records approved therapies for Fabry disease (agalsidase beta, migalastat, pegunigalsidase alfa) and Fayuvi for MPS IIIA. Several other diseases in the slice have approved treatments that are not yet in the graph. Where no treatment is recorded, the site says so and states that this does not mean none exists.
- Trials are mapped to diseases by title matching, which is medium confidence.
- Endpoint rows built from HPO keyword matches are candidates, not confirmed trial endpoints. Biomarker validation status varies, and blood nerve-damage markers such as NfL and GFAP are not validated endpoints for any disease in this slice.
- The 10x Case is a single modeled example with stated assumptions. Its numbers are estimates, not measured timelines, and no published source quantifies the savings.
- "Maria", the Sanfilippo A family advocate in the journey, is a composite and not a real patient. The National MPS Society has not agreed to any proposal described here.
- LLM-extracted claims are pointers to the literature, not medical guidance. Preprint claims carry more uncertainty and are labeled by source.
- A scientific review of the site copy is in `docs/SCIENTIFIC_QA.md`, with open corrections listed there.

## License

No license file has been added yet, so the code is all rights reserved by default until one is chosen. Source data keeps its original terms: Orphanet data is CC BY 4.0, and HPO, Mondo, ClinVar, ClinicalTrials.gov, PubMed, and NIH RePORTER data are used under their published terms of use.

This site is for information and research. It does not give medical advice. Talk to a clinician about any diagnosis or treatment decision.
