# Graph Representation Brainstorm — How a Parent Should See the Knowledge Graph

**Problem (from user testing):** the Explore tab's network view "just looks like a bunch of lines." A stressed parent with zero medical knowledge does not want to see a graph. The graph is plumbing; parents want answers that can prove themselves.

**Method:** two independent brainstorms — one from a code-focused AI assistant (Codex), one from Anthropic's most capable model (Claude Opus) — same brief, no shared context. This doc groups their proposals by pattern, notes agreement and disagreement, and ends with a ranked recommendation.

**Design constraint both were given:** simpler and calmer, but never childish or jokey. Medically serious and credible.

---

## The patterns (grouped)

### 1. Orbit / radial view — disease at the center
- **Codex ("Disease-Centered Orbit"):** the child's condition anchored at center, five labeled sectors (Genes, Symptoms, Care, Research, Support). Only the strongest connections shown first; tapping a sector expands it while the rest fades. Filters for "newly diagnosed" vs "treatment planning."
- **Claude ("Concentric Circles of Proximity"):** disease at center; ring 1 = "most important to know first" (gene, primary symptoms, one active treatment); ring 2 = next steps (specialists, orgs, trials); ring 3 (faded) = deeper research. Rings evoke medical diagrams (cells, cross-sections) — credible without expertise.
- **Agreement: STRONG.** Both independently proposed radial layout. Both keep the disease as the stable anchor and use progressive disclosure.

### 2. Question-answer cards
- **Codex ("Evidence-Backed Answer Cards"):** dashboard of questions — "What causes this? What should we monitor? Who can help?" Each card: short answer, confidence label, review date, source count. Expanding reveals evidence quotes and a compact connection diagram.
- **Claude ("Question-Answer Cards"):** vertical stack of 6–8 cards headed with natural questions, collapsed to question + one-sentence preview. Expanding reveals structured answers, evidence quotes, 1–2 action items. Cards can be reordered by priority.
- **Agreement: STRONG.** Both mirror how doctors should communicate — anticipating questions, direct answers, zero learning curve. Parent feels heard before asking.

### 3. Sentence paths (the graph as prose)
- **Codex ("Plain-Language Connection Sentences"):** edges become readable chains — "This disease is associated with changes in this gene. Those changes can affect this cellular process." Each clause carries an evidence-strength marker; careful verbs ("causes" vs "is associated with" vs "may contribute to") preserve medical nuance.
- **Claude ("Sentence Paths with Evidence"):** plain-language statements stacked vertically, each with a small "evidence" icon. Tapping a noun offers a gentle tooltip; the default state is readable narrative, "like Mayo Clinic or NIH, not a tech demo."
- **Agreement: STRONG.** Both replace edges with sentences and put evidence one tap away.

### 4. Journey as story, not network
- **Codex ("Care-and-Research Journey"):** pathway organized by likely next steps (understand → assemble care → monitor → explore treatment → consider research → find community). Items can be marked "discussed / not relevant / ask later." Explicitly avoids implying every family follows the same timeline.
- **Claude ("Journey Map"):** horizontal timeline anchored at diagnosis ("Today"), extending backward (research milestones) and forward (treatment phases, trial readouts). Waypoints expand into curated items. The timeline implies forward motion — "others have walked this path."
- **Agreement: MODERATE.** Same story instinct, different caution: Codex warns against implying a single timeline (important when most of these diseases have no approved treatment); Claude leans into forward momentum as emotional reassurance.

### 5. Comparison cards (Codex only)
Structured cards with identical fields (cause, inheritance, typical signs, diagnostic distinctions, care, trials, support). Differences emphasized, shared features muted. Fixed structure prevents false conclusions from visual proximity. *Note: a first version of this was already built as the symptom-comparison view.*

### 6. Guided "What This Means" path (Codex only)
Calm linear sequence: Diagnosis → Gene → What changes in the body → Symptoms → Care options → Trials and support. One plain sentence per step, medical source shown, "Why?" expands the evidence quote.

### 7. Three-paths dashboard: Understand / Act / Connect (Claude only)
Three columns respecting the emotional arc: first understand, then act, then find community. Progress indicators ("You've explored 2 of 12 items") give a sense of control — "I am doing something."

### 8. Summary + Explore toggle (Claude only)
First load: a single clean medical brief (what it is, treatments, trials, who can help). A "Summary / Explore" toggle switches to a heavily filtered graph (15–20 most relevant nodes, no hairball). Acknowledges two user modes — panicked vs. curious — without forcing a choice.

---

## Where they agree
1. **Never show the raw graph to a parent by default.** Both relegate the full network to experts; the graph powers the backend while remaining invisible.
2. **Answers before structure.** Both lead with the parent's questions, not the data model.
3. **Evidence one tap away, always.** Verbatim quotes, sources, dates — traceability is what makes a calm UI trustworthy instead of patronizing.
4. **Progressive disclosure everywhere.** Overview first, details on demand (both cite this independently).
5. **Honest uncertainty.** Both insist on distinguishing established fact from emerging research — Codex via evidence-strength markers, Claude via "known / possible / not yet established" framing.

## Sharpest disagreement
**How much hope the UI should imply.** Claude's journey map uses forward motion as emotional reassurance ("there is a path, others have walked it") and borrows social proof from Airbnb-style consumer UX. Codex is warier: its journey explicitly avoids implying every family follows the same timeline, and its comparison cards mute shared features to prevent false conclusions. For diseases where <5% have approved treatments, Codex's caution is the medically safer instinct — reassurance must come from honesty ("here is exactly what is known") rather than from implying a path that may not exist. A close second: Claude would steal liberally from consumer UX (Spotify curation, Maps navigation confidence); Codex would steal from clinical communication (discharge instructions, differential-diagnosis structure).

---

## Recommendation (ranked)

Ranked by (a) parent comfort, (b) build cost before the Oct 4, 9:00 AM ET deadline, (c) judge impact. All three build on the existing evidence layer (verbatim quotes, observed/inferred labels) and existing views (guide, journey steps, symptom comparison).

### 1. Question-answer cards (per disease)
Highest parent comfort — zero learning curve, mirrors good clinical communication. Lowest build cost — text layout with expanders, templated questions answered from graph data already present. High judge impact — directly demonstrates the "evidence integrity" criterion and visibly differentiates from hairball demos.

### 2. Sentence paths with evidence
High comfort — reads like Mayo Clinic/NIH, causality is imposed by grammar instead of constructed by the user from fragments. Low-to-medium cost — sentence templates generated from edge data plus evidence icons. High judge impact — makes the graph legible as prose; a judge can grasp any connection in seconds.

### 3. Orbit / radial view
High comfort — the disease stays the visual anchor, bounded and calm, no hairball possible by construction. Medium cost — radial layout with progressive disclosure is real frontend work under deadline pressure. Highest visual distinction for judges, but the most build risk tonight. Best positioned as the signature "wow" view if time allows after #1 and #2.

**What stays:** the full network view remains for the researcher persona, moved behind the answer-first screens so a parent never lands in it by accident.

---

## Term explanation for parents (added per user request)

**Problem:** the demo has a 40-term glossary, but a separate glossary page is not enough. A stressed parent encounters jargon inline — gene symbols like SGSH, phrases like "enzyme replacement therapy" or "natural history study" — and will not leave the page to look things up. Both models were asked independently; they converged unusually tightly.

### Where they agree
1. **Tap-any-jargon inline definitions.** Medical terms get a subtle dotted underline; tapping opens a small card in place with the shortest useful explanation first. No navigation away, no lost place. (Codex #1, Claude #1 — nearly identical proposals.)
2. **Layered depth, never one fixed level.** One sentence → why it matters → full clinical definition. Most parents stop at layer one; a parent preparing for an appointment goes deeper. Labels signal depth without judgment. (Codex #4 "layered explanation sheet," Claude #4 "progressive depth cards.")
3. **Mirror the parent's own question.** A visible "What does this mean?" affordance — beside high-impact phrases (Codex) or at the end of dense paragraphs (Claude) — because the parent is already thinking it and should not need medical vocabulary to ask for help.
4. **Plain-language mode that keeps the clinical term visible.** A persistent toggle rewrites sentences in plain words but preserves the medical term in parentheses, so parents recognize it later in appointments and reports. Both versions stay available; nothing is hidden or softened. (Codex #3, Claude #2.)
5. **Plain words, not wrong words.** Both models independently warned: simplification must never sacrifice medical accuracy or severity. The clinical term stays visible precisely so the parent is not misled.

### Nuance worth keeping
Codex would place "What does this mean?" selectively beside decision-relevant terms (to avoid clutter and keep the signal trustworthy); Claude would add a persistent edge icon that works on any highlighted text, even untagged terms — a visible safety net. Both are cheap to build; the persistent trigger covers the long tail the taggers miss.

### Recommendation
Ship in this order: (1) tap-inline definitions on tagged terms with layered depth — highest value, bounded work; (2) plain-language toggle — one control that simplifies every screen at once; (3) persistent "what does this mean?" trigger for untagged text.
