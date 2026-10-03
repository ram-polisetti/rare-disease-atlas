# DRAFT — Walkthrough video script (1 minute)
**Status: DRAFT — awaiting Charan's review. Nothing is recorded, narrated, or
treated as final without his explicit go-ahead.**

Recorded against the live demo at https://ramcharan.co.network/rare-disease-atlas/
(or locally via `python3 -m http.server` in `site/`). Screen-record the click path:
**search → MPS IIIA → SGSH → journey → patient action.**
Narration below was polished by Claude (haiku); screen actions are beats to hit.

## Script

**0:00–0:05 — Hook** [Show the atlas loading with the full graph.]
"If your child has a disease affecting only a thousand people worldwide, no
clinical trial registry exists for it. The Rare Disease Atlas solves this by
grouping rare diseases that share the same biology."

**0:05–0:15 — Search** [Type 'sanfilippo' in the search box; click MPS IIIA.]
"Type Sanfilippo, and the atlas shows you MPS IIIA, one of fifty-one diseases
caused by sixteen genes."

**0:15–0:30 — MPS IIIA node** [Click the node; detail panel opens.]
"You'll see the gene responsible, genetic variants from ClinVar, symptoms from
the Human Phenotype Ontology, active clinical trials with links, and research
papers with citations. Everything here has a source."

**0:30–0:40 — SGSH → shared mechanism** [Click SGSH, then the GAG catabolism node.]
"SGSH, the Sanfilippo gene, works in the same biological pathway as MPS I and
MPS II. Same mechanism, different disease names. That's the key insight: a trial
design or registry built for one disease can work for another."

**0:40–0:52 — Maria's Journey** [Open the Maria's Journey tab; step through 8 steps.]
"The atlas then maps a patient's journey through these connected diseases
toward existing treatments and research studies — eight steps from Sanfilippo A
through the MPS I and MPS II treatment precedents to the National MPS Society
and a sourced natural-history study proposal, with every step clearly labeled."

**0:52–1:00 — Patient Action, close** [Open the Patient Action tab.]
"For families right now, it highlights what's actionable this week in green,
and uncertain leads in amber. Over 94 percent of the claims in this graph have
a direct source quote, verified by machine. That's the Rare Disease Atlas."

## Recording notes
- 60 seconds total; keep each beat on time or the close gets cut.
- Zoom the browser so node labels read clearly in the recording.
- Pause narration during clicks so each click registers visually.
