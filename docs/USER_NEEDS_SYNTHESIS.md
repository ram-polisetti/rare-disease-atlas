# User Needs Synthesis — Rare Disease Atlas

How this was built: three independent passes — a product thinker mapping each persona's real-life moment, a fresh-eyes review of what a newly diagnosed parent needs in the first 72 hours / month / year, and a builder's gap analysis of the current UI against the code. Every feature below cites the need it serves.

## The governing lens: design for a stressed parent

The primary user is a parent in a confused, stressful situation — possibly 2 AM, possibly the day of the diagnosis. Everything in the parent-facing guide follows from this:

- Fewer choices per screen. One clear next step, not a menu of twelve.
- Plain words over jargon. Medical terms get a tap-for-definition, never a wall of text.
- Bigger touch targets. Shaking hands, small phone screens.
- Reassuring tone. "You're doing the right thing by looking." Never blame, never overwhelm.
- Clear "what happens next" at every step. No screen should leave a stressed parent wondering where they are.
- No dead ends. Every screen offers a way forward — even "we don't have this" screens route to a geneticist, NORD, or a rephrased search.
- The guide must never make a stressed parent feel lost or stupid. If a screen could do that, it's a bug.

## Persona needs

### The new parent (primary user)
**The moment:** the diagnosis call just came — a word they can't pronounce. They're Googling at midnight and finding jargon, worst-case timelines from old papers, and grief-filled forums. They are not looking for a knowledge graph; they are looking for someone to tell them what to do tomorrow morning.

**In order, they need:**
1. What IS this, in words I understand — one screen, plain language, 60 seconds.
2. Am I alone — proof other families exist (patient orgs, not names).
3. What do I do tomorrow — ONE concrete step (call a geneticist, contact a parent group, ask the pediatrician for a referral).
4. Is there any treatment — the honest answer, including "none yet" when true. Never false hope, never hidden hope.
5. Something to TAKE to the doctor — a printout, because their pediatrician has likely never heard of this disease either.

**First month:** the panic joins logistics. Decisions: which specialist (and where are the real experts, not just local), approved vs experimental treatments with evidence quality labeled, open trials with eligibility in plain words, insurance/access help, inheritance and sibling testing, school/early intervention. They need structured, appointment-ready checklists — evidence-tagged, source-linked.

**First year:** trajectory and community. What surveillance is standard, what's new in research (a curated update feed, not 50 sources to monitor), bridges to real humans (conferences, parent groups), and honesty about hard prognoses with supportive resources pointed to compassionately.

**Trust vs abandon.** Trust: plain language first, visible sources, honest "we don't know", never diagnosing, "last verified" dates. Abandon: one dead button, one invented fact, jargon on the first screen, false precision about their child's future, any whiff of selling something, toxic positivity.

### The patient-organization leader (the challenge's patient leader)
**The moment:** board meeting Thursday. Limited funds, researchers asking for grants, parents asking "what are you DOING." Every month of delay is measured in children's lives.
**Needs:** what can we REUSE instead of building (natural-history designs, registries, endpoints from neighboring diseases); who shares our biology (collaborators); one milestone to rally around (e.g. a shared cross-disease natural-history study); board-ready printouts with timeline/cost models.

### The therapy scout
**The moment:** her platform worked in one disease; which indication next? A wrong pick burns years and millions.
**Needs:** mechanism clusters (who shares the biology her approach targets), shared endpoints (can trial designs be reused), the existing trial landscape, researchers to talk to — all exportable and citable.

### The researcher
**The moment:** writing a grant, checking a claim — is this connection real or hype?
**Needs:** click any connection → verbatim source quote, paper, observed-vs-inferred label, contradictions shown both-sided. One click from claim to evidence.

## Builder's gap analysis (current UI vs these needs)

Gaps found reading the current guide code:
1. **Symptom matches can't be compared.** The guide returns up to 4 candidates but each opens alone. A parent told "it might be X" needs to see the candidates side by side: what symptoms they share (why they're confused) and what tells them apart (what to tell the doctor). → *Build B*
2. **The printable summary is incomplete.** "Your summary" prints community orgs, studies, related conditions — but not genes, symptoms, shared endpoints, evidence quotes, gaps, or therapy status. A parent taking it to the pediatrician, or a leader taking it to the board, needs the full dossier in one document. → *Build A*
3. **No "what happens next" on some deep screens.** The hub has "one thing for tomorrow"; the export screen ends at Print. Every terminal screen should restate the next step.
4. **Misdiagnosis is the norm, the tool under-serves it.** ~65% of rare-disease patients report being misdiagnosed first; families spend years seeking accuracy. The symptom path needs a "commonly confused with" framing built from the HPO overlap data the graph already holds — currently only a flat candidate list.
5. **Evidence quotes live one click away, but the dossier doesn't carry them.** The explore tab shows quotes per edge; nothing portable carries the top 2–3 quotes per disease. A printout without sources is just claims.

## What we built from this (traceability)

- **Full dossier print (Build A)** → new parent's "take it to the doctor" (first 72h); leader's "bring it to the board"; scout's "citable evidence pack". One document: what it is (plain), also-called names, genes, key symptoms, shared measurable endpoints, trials, patient orgs, reusable assets, short evidence quotes with sources, open gaps, therapy-status banner. Print-clean CSS.
- **Symptom comparison view (Build B)** → new parent's pre-diagnosis / misdiagnosis moment. All candidates side by side: shared symptoms, differentiating symptoms, per-disease "what makes this one different". Keeps "only a clinician can diagnose" framing and geneticist routing on every render.
- **Stressed-parent lens applied to both:** short sections, plain headings, "what to do next" box on the dossier, reassuring microcopy, no walls of text, "not recorded" wherever data is missing (never invented).

## Follow-ups (screens violating the stressed-parent lens — not yet fixed)

- The Explore tab drops a stressed parent into a graph with no guidance; needs a one-line "start here" for first-time visitors arriving from the guide bridge.
- The Endpoints tab's "sharing a measurement is not sharing biology" warning is correct but jargon-dense; needs a plain-language version for parents.
- The Contradictions tab assumes the reader knows what a contradiction means in research; needs a one-sentence plain intro.
- Trial eligibility checklists should state "ask your doctor" more prominently — currently easy to skim past.
