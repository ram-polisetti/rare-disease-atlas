# Extraction log fragment — LLM biomedical triple extraction

## Coverage summary (2026-10-03, ~2:00 PM ET)

**STATUS: BLOCKED on auth — 0 of 478 abstracts processed.** The Ollama Cloud chat
endpoint (`POST https://ollama.com/api/chat`) rejects every request with HTTP 401
Unauthorized (tested 3 attempts, 2 models: gpt-oss:120b, minimax-m2.7). The
`models` listing endpoint still responds, but that endpoint needs no auth, so it
proves nothing about the token. The extraction pipeline itself is fully built,
offline-tested, and ready: one command (`python3 scripts/extract_llm_edges.py`)
will process all 478 abstracts the moment the `custom.ollama` connector is
reconnected. Nothing has been written to `data/processed/llm_edges.json` yet —
no extraction output exists, verified or otherwise.

## What I did
1. Read `~/workspace/skills/ollama/SKILL.md` and the `bin/ollama_cloud.py` CLI;
   listed models: gpt-oss:120b, mistral-large-3:675b, deepseek-v4-pro:0813,
   minimax-m2.7, kimi-k2.7-code, etc. (qwen3.5:397b is NOT on this account, so it
   is skipped in the model order).
2. Inspected `data/raw/pubmed_abstracts.jsonl`: 478 records, fields
   pmid/title/abstract/authors/journal/year/source/retrieved/query_entity/entity_type
   (243 gene, 235 disease); 13 records have empty abstracts (title-only
   extraction will be attempted for those).
3. Tested one real chat call: HTTP 401. Retried twice with a trivial prompt on two
   models: still 401. Checked the credential wiring (`dynamic_credentials.py`):
   the surrogate is attached correctly; this is a rejected token, not a wiring bug.
   No local LLM exists on the VM (no `ollama` binary, no torch) — no fallback.
4. Built `scripts/extract_llm_edges.py`: short per-abstract prompts
   (~120-word instruction + title + abstract, temp 0.2, max_tokens 900),
   model order gpt-oss:120b → mistral-large-3:675b → deepseek-v4-pro:0813,
   ONE retry on empty/unparseable response, then `skipped: true`; 2 worker threads
   max; resume-safe JSONL checkpoint (`data/processed/llm_edges_checkpoint.jsonl`)
   so interrupted runs pick up where they left off; hard abort with `AUTH_FAIL`
   instead of marking abstracts skipped when all models 401.
5. Offline-tested the verification layer with a realistic mock model response on a
   real abstract (PMID 28218669): ungrounded entity (FAKEGENE1), absent variant
   (L444P), invented phenotype, and a claim with a fabricated quote were all
   correctly discarded; two verbatim-quote claims kept at "medium"; output schema
   matches the required spec exactly.

## Prompt design
"From this abstract, list: (1) genes mentioned, (2) variants mentioned, (3)
phenotypes/symptoms mentioned, (4) claims as subject-relation-object triples, (5)
investigator names. Copy each claim's quote VERBATIM from the abstract (a short
exact substring). Reply ONLY as compact JSON, no markdown: {…}. Abstract: <title
+ abstract>." Kept short deliberately — long prompts return empty responses on
this API (known quirk).

## Verification rules (evidence integrity)
- Entity label must be a case-insensitive substring of title+abstract (plus
  dash/space/nodash variants and a small GBA↔GBA1 alias map); otherwise dropped.
- Claim must have subject/relation/object and a quote; quote is
  whitespace-normalized and matched against the text: verbatim → "medium",
  difflib ≥ 0.8 fuzzy → "low", else the claim is dropped. `contradicts` passes
  through from the model (default false); contradictory findings are kept, not
  suppressed.
- Investigators are taken from the model response, deduplicated.

## What worked / didn't and why
- Worked: model listing, pipeline build, JSON parsing (fence-tolerant),
  verification layer (offline test above), checkpoint/resume logic, 401 fail-fast.
- Didn't: any actual LLM extraction — the `custom.ollama` credential is rejected
  by `POST /api/chat` (401). Per the skill this needs
  `credentials.request_api_access` with `reconnect` for `custom.ollama`; that tool
  is not available to this subagent, so it must be done by the parent/root agent.

## Final counts
- Abstracts processed: 0 (blocked). Skipped: 0. Claims extracted: 0.
- Verification layer offline test: 5 entities kept / 3 dropped, 2 claims kept
  (medium) / 1 dropped — discards behave as designed.
- Estimated runtime once unblocked: ~2–3 h sequential-ish at 2 threads
  (478 abstracts × ~20–30 s/call, some retries); checkpoint allows pausing.

## Exact rerun command (after connector reconnect)
```
cd ~/workspace/hack-nation-rare-disease-atlas
python3 scripts/extract_llm_edges.py   # writes data/processed/llm_edges.json
```
