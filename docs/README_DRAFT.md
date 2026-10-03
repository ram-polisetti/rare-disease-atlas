# README draft sections (Claude-drafted, Sat ~3:35 PM EDT — Phase 4 head start)
To be assembled into README.md in Phase 4 with UI + video + submission info.

## Architecture

Data flows through a linear pipeline: pull scripts in `scripts/` fetch from MONDO, HPO,
ClinVar, PubMed, ClinicalTrials.gov, Orphanet, Monarch, NIH RePORTER, and Europe PMC into
`data/raw/` (gitignored). Extraction batches populate `data/processed/` with biomedical
claims, each tied to a verbatim `source_quote` from cited abstracts.
`scripts/verify_quotes.py` performs 100% string matching of quotes against source abstracts;
Claude spot-checks add a secondary layer. Merge scripts consolidate into
`data/_curated_intermediate.json`, then `scripts/build_graph.py` applies Louvain clustering,
generates summaries, and traces patient journeys into `data/graph.json`. This graph is
copied to `site/graph.json` and served by a static single-page UI (vanilla JavaScript +
vis-network CDN, no build step) on GitHub Pages. Each graph edge carries 10 metadata
keys — source, target, relation, evidence, confidence, source database, source reference,
date, note, contradicts — per `docs/GRAPH_SCHEMA.md`. Contradictions are preserved,
never suppressed.

## Reproduce the Dataset

1. Clone the repository and create a Python 3.12 venv.
2. Run `scripts/pull_*.py` to fetch from public APIs (NCBI E-utilities, etc.). Requires network access.
3. Follow the extraction brief in `docs/EXTRACTION_BRIEF.md` to generate claims with quoted evidence.
4. Run `scripts/verify_quotes.py`, then `scripts/merge_*.py`, then `scripts/build_graph.py`.
5. Copy `data/graph.json` to `site/graph.json` and deploy.

Note: `data/raw/` is gitignored (185 MB). Full reproduction re-pulls from public APIs.

## Known Limitations

OMIM is excluded (requires authentication). ClinVar and Monarch serve as variant and
disease-association surrogates. LLM-extracted claims are quote-grounded and verified but
should be read as literature pointers, not medical guidance. Preprint claims (bioRxiv,
medRxiv) are flagged by source and carry higher uncertainty.
