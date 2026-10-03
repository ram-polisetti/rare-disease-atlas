# Phase 2 extraction brief — biomedical claim extraction (Codex executor) — v2 (grounded)

## Task
Extract evidence-backed biomedical claims from PubMed abstracts and write them as a
JSON array for merging into the rare-disease knowledge graph.

**Verification model (NotebookLM technique): every claim is grounded by a verbatim
quote from its source abstract. Verification is two-stage:**
1. **Programmatic (total):** `scripts/verify_quotes.py` checks 100% of claims —
   each `source_quote` must string-match (whitespace-normalized, case-insensitive)
   the cited abstract. Failures are quarantined and re-extracted.
2. **Semantic (sample):** Claude spot-checks small batches — does the quote actually
   support the claim? Cheap by design; never bulk-processed.

## Input
`/home/hatch/workspace/hack-nation-rare-disease-atlas/data/processed/extract_batch_N.jsonl`
(one JSON object per line: pmid, title, abstract, authors, journal, year, query_entity).
16 records across all batches have an empty abstract (title only) — for those, extract
at most what the title alone supports, or skip the record.

## Output
`/home/hatch/workspace/hack-nation-rare-disease-atlas/data/processed/llm_edges_batch_N.json`
A single JSON array. Each item:
{"subject": "...", "relation": "...", "object": "...", "pmid": "...",
 "source_quote": "...", "confidence": "medium", "contradicts": false}

## The grounding rule (the whole point)
- `source_quote` is REQUIRED on every claim — no exceptions, no paraphrase loophole.
- It MUST be a verbatim substring of the title+abstract (whitespace-normalized).
  If no verbatim span supports the claim, DROP the claim. Do not paraphrase into
  the field; do not stitch fragments together.
- The quote must actually support the relation you assert (subject → relation → object).
  Both subject and object labels should be visible in or immediately supported by
  the quoted span's context.
- Confidence is "high" only when the quote states the claim directly and
  unambiguously; "medium" when the quote supports it but requires domain reading;
  never "low" — a claim that needs a "low" is a claim without a verbatim span,
  and it gets dropped.

## What to extract
Claims as subject–relation–object triples, ONLY about:
- gene → variant → mechanism (e.g. SGSH variant impairs sulfamidase → heparan sulfate accumulates)
- disease → phenotype/symptom
- drug/treatment → disease (what was studied, NOT approval status)
- gene → disease association

## Evidence-integrity rules (follow exactly — this is what the judges score)
1. Subject and object labels MUST appear verbatim (case-insensitive) in the
   title+abstract. Allow dash/space/nodash variants ("Niemann-Pick" = "Niemann Pick").
   GBA and GBA1 are the same gene. Label absent from text → DROP the claim.
2. NEVER invent: no drug approvals, no trial outcomes, no variant names, no researcher
   names, no entities absent from the text. If the abstract does not state it, it does
   not go in. NEVER write "FDA approved" or equivalent unless those exact words appear.
3. Prefer canonical labels: gene symbols (GBA, SGSH, IDS, NAGLU, HGSNAT, GNS, GLA, GAA,
   SMPD1, NPC1, NPC2, HEXA, HEXB, IDUA, GALC, ARSA); disease names ("Gaucher disease",
   "Fabry disease", "MPS IIIA", "Sanfilippo A", "Hunter syndrome", "MPS II",
   "Pompe disease", "Niemann-Pick disease type C", "Tay-Sachs disease",
   "Sandhoff disease", "Krabbe disease", "Metachromatic leukodystrophy",
   "Mucopolysaccharidosis type I").
4. "contradicts": true ONLY if the abstract explicitly reports findings contradicting
   an established claim. Default false. Contradictions are kept, never suppressed.
5. Relations: short snake_case predicates, small consistent vocabulary
   (caused_by_variant_in, treated_by, studied_in, associated_with, presents_with,
   encodes, disrupts, accumulates_in). Reuse these; do not invent new ones freely.
6. Deduplicate identical (subject, relation, object) triples within the batch.
7. Aim 0–6 claims per abstract; most yield 1–3. Quality over quantity.

## Workflow
1. Read the batch file. Process EVERY line.
2. Write the JSON array to the output path. Re-read the file and confirm it parses
   as JSON before finishing. If it does not parse, fix it.
3. Do NOT commit to git. Do NOT modify any other file.
4. Final message: abstracts processed, claims kept, and a 3-line sample of kept claims
   WITH their source_quote values.

## Version history
- v1 (2026-10-03 ~2:20 PM): field named "quote"; allowed "low"-confidence
  near-verbatim paraphrase. Superseded.
- v2 (2026-10-03 ~2:30 PM): renamed to "source_quote"; verbatim required on every
  claim, paraphrase loophole closed; two-stage verification contract added
  (programmatic total check + Claude semantic spot-checks). Pivot ordered by Charan:
  grounded quotes are now the primary verification mechanism; the independent
  Claude extraction sample is a secondary cross-check.
