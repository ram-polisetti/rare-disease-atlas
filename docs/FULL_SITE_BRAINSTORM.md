# Full-Site Component Brainstorm — All 13 Components, Parent First

**Problem (from user testing):** the graph view "just looks like a bunch of lines." The directive: brainstorm ALL website components, not just the graph — simpler and calmer for a stressed parent with zero medical knowledge, but medically serious, never childish or jokey.

**Method:** two independent audits — one from a code-focused AI assistant (Codex), one from Anthropic's most capable model (Claude Opus) — same component list, no shared context. This doc tables their verdicts per component, proposes a restructured tab layout, records agreement and disagreement, and ends with a ranked build list. It builds on the earlier graph-representation brainstorm (orbit views, Q&A cards, sentence paths, tap-any-jargon definitions) rather than repeating it.

---

## Per-component verdicts

| Component | Parent need (one sentence) | Verdict | Key change |
|---|---|---|---|
| Guide | "Help me understand what may matter today, who can help, and the safest next action." | **Redesign** | Short guided conversation: search → confirmed vs possible match → ONE recommended action, alternatives collapsed under "Other paths." |
| Start | "Tell me where to begin when I know nothing about this field." | **Merge into Guide** | Four equal personas create a choice before the user understands the site. Fold in as a lightweight role selector after the welcome message; switchable anytime. |
| Explore | "Explain which diseases, mechanisms, and organizations may be relevant — and why." | **Gate (researcher mode)** | Keep as an explicitly labeled expert workspace. Never the landing; open on a filtered subgraph around one disease, not the full network. |
| Clusters | "Show me diseases that might share something important with ours, and whether that creates a practical opportunity." | **Redesign** | Plain-language "possible shared biology" cards: shared feature, why it might matter, confidence level, one meaningful difference. |
| Subway | "Give me a memorable overview of how our disease connects to research routes." | **Merge into Clusters** | Transit metaphors imply biology follows clean routes. Keep only as an optional visual mode inside Clusters, with an explicit legend of what lines and distance do NOT mean. |
| Endpoints | "What do researchers measure in this disease, and could another disease's work help us measure progress?" | **Redesign** | Organize around parent questions (what changes for the patient, how it is measured, whether regulators accept it). The "sharing a measurement is not sharing biology" warning sits beside every cross-disease comparison, not just at the top. |
| Patient Action | "Give me one trustworthy page separating what can be done now from what might become possible later." | **Keep, prioritize** | Make it the primary disease home. Order: current care and safety → treatment status → organizations → enrolling research → ways to contribute → assets and gaps. Say explicitly when the right action is simply "contact a specialist." |
| Journey | "Show me a manageable sequence from diagnosis or suspicion to support, care, and research." | **Rebuild** | Replace the fixed linear checklist with a state-based navigator: diagnosis uncertain / confirmed / seeking care / considering research / building a patient group. Show only the next 2–3 relevant steps, including pauses and dead ends. |
| What If | "If our community invests in one project rather than another, what could it unlock, and what could go wrong?" | **Gate (org-leader workspace)** | Not default parent navigation. Compare scenarios with ranges, dependencies, reversibility, and explicit "model judgment" labels — never a single predictive score. |
| Contradictions | "Tell me calmly what experts disagree about and whether it changes any decision." | **Redesign / merge** | Group disputes by practical consequence. Lead with a neutral synthesis, then positions with evidence date and quality, current consensus, and "what this changes for families." |
| Recent | "Tell me only about genuinely important new developments for our disease." | **Merge into disease pages** | Recency is easily mistaken for importance. Fold into each disease page as "What changed recently," limited to material updates classified by impact. |
| Honest Gaps | "Explain compassionately what is still unknown, why it matters, and whether anyone is working on it." | **Keep** | Structured cards: unanswered question, consequence, current work, plausible next step, who could help, tractability. Separate gaps affecting present care from those affecting future therapy. |
| 10x Impact | "Show me a credible picture of the next milestone without promising acceleration guarantees success." | **Redesign + rename** | Rename "Path to the Next Milestone." Show bottleneck, baseline range, proposed intervention, dependencies, earliest decision point, failure conditions, evidence behind each assumption. Ranges, never a single compressed timeline. |

---

## Proposed tab structure

### Parent mode (default): 5 tabs + settings

| Order | Tab | Rationale |
|---|---|---|
| 1 | Guide | Emotional entry + search; redesigned as guided conversation |
| 2 | Your Disease | Renamed from Patient Action; possessive language centers the child |
| 3 | Journey | Rebuilt as state-based navigator; reduces "what now" paralysis |
| 4 | What's New | Renamed from Recent; plain language, keeps returning families engaged |
| 5 | Gaps & Limits | Honest Gaps + Contradictions merged; trust-forward, admits uncertainty |
| ⚙ | Settings | "Show research tools" toggle unlocks the full set; saved diseases, alerts |

### Researcher mode (gated toggle): adds the rest

Explore, Clusters (+Subway view), Endpoints, What If, 10x Impact ("Path to the Next Milestone"), plus a global evidence feed.

### Removed as standalone tabs
- **Start** → merged into Guide as a role selector.
- **Subway** → optional view inside Clusters.
- **Recent** → folded into disease pages ("What changed recently").

### Structural rules
- **Mode persistence:** chosen once (first-visit prompt or settings), respected across sessions.
- **Cross-links over tabs:** Journey links into Your Disease; Your Disease links into Gaps & Limits where relevant. Tabs are for direct navigation; in-context links do the guiding.
- **Mobile-first:** Guide → Your Disease → Journey must work flawlessly on a phone at midnight. Researcher tools may assume desktop.
- **Sources:** one tap away everywhere in both modes; never unprompted in parent mode.

---

## Where both models agree
1. **Guide is the correct default landing** — but it must be a shorter conversation ending in one recommended action, not a dashboard of everything at once.
2. **Start, Subway, and Recent die as standalone tabs** — merged into Guide, Clusters, and disease pages respectively. (Identical cut lists from both models.)
3. **Explore is researcher-only** — gated, never the landing, opens filtered.
4. **Patient Action becomes the disease home** — reordered by urgency and certainty, with explicit permission to do nothing but call a specialist.
5. **"10x" gets renamed and de-hyped** — ranges and failure conditions replace the single compressed timeline.
6. **Jargon tiers for tap-for-definition** (from the earlier brainstorm, confirmed): tier 1 = gene symbols, trial phases, "natural history study"; tier 2 = endpoint names, mechanism terms; tier 3 = pathway/regulatory terms, defined inline but hidden from parent-mode defaults.

## Sharpest disagreement
**What stays visible in parent mode: Recent and Contradictions.** Codex merges Recent into disease pages and keeps Contradictions as a standalone redesigned tab; Claude keeps Recent visible as a "What's New" tab but merges Contradictions into Gaps & Limits. Underneath: Codex trusts structure (a dedicated, carefully framed disputes tab avoids false balance), Claude trusts sequencing (fewer tabs, uncertainty in one honest place). Second-order disagreement: Journey — Codex rebuilds it from scratch as a state-based navigator; Claude keeps the linear walk but softens it. Both agree the current builder-style journey is wrong for a parent in crisis.

---

## Ranked top-5 build list

Ranked by (a) parent comfort, (b) build cost before the Oct 4, 9:00 AM ET deadline, (c) judge impact.

### 1. Parent/researcher mode toggle + restructured tabs
Highest structural leverage: one toggle gates the hairball, the scenario planner, and the persuasion-oriented 10x view away from frightened parents while keeping researchers fully equipped. Medium cost (tab-visibility logic, first-visit prompt, settings persistence). Directly answers the "who is this for" confusion judges will feel in the first 30 seconds.

### 2. Guide redesign: one recommended action
Turn the current everything-at-once guide into a short conversation ending in a single clear next step, with Start's role selector folded in. High parent comfort, medium cost, and it is the first screen every judge sees.

### 3. "Your Disease" parent-mode page
Patient Action reordered by urgency (care and safety → treatment status → orgs → enrolling research → contribute → assets/gaps), with a status banner ("No approved treatment. 2 trials recruiting. 1 patient organization active.") and explicit permission to just call a specialist. Low-medium cost; the page parents will screenshot and share.

### 4. Journey rebuild: state-based navigator
Replace the fixed checklist with states (diagnosis uncertain / confirmed / seeking care / considering research / building a group), showing only the next 2–3 steps including pauses and dead ends. Medium cost; kills the most dangerous implication in the current build — that every family follows the same path.

### 5. Tier-1 tap-for-definition
Gene symbols, trial phases, "natural history study" — inline layered definitions building on the existing glossary. Low-medium cost, touches every screen at once, and directly serves the midnight-phone parent.

**Deliberately deferred past the deadline:** the orbit/radial graph view (highest visual distinction, highest build risk — from the earlier brainstorm); persistent "what does this mean?" trigger for untagged text; saved-disease alerts.
