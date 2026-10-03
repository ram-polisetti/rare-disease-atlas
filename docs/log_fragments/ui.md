# UI build log — `app/app.py`

## What was built
A single-file Streamlit app (`app/app.py`, ~600 lines) implementing the Challenge 05
brief against the `docs/GRAPH_SCHEMA.md` contract. It reads ONLY `data/graph.json`
(via `st.cache_data`) and renders four sections:

1. **Explore** — global search box (exact `synonyms`-map hit, else substring fallback
   over labels + synonyms; ambiguity shows candidate buttons; no match shows an honest
   "no supported connection" panel listing what evidence could add the link).
   pyvis-style interactive graph via `streamlit-agraph`: node + 1-hop neighborhood on
   search, disease-node overview when idle, legend, click → detail panel (right column)
   with description and EVERY edge: relation, plain-language note, source_db + clickable
   source_ref (PMID → PubMed, NCT → clinicaltrials.gov, URLs direct), date, confidence
   badge, observed/inferred tag. `contradicts: true` edges render in a red warning card
   labeled "Contradictory evidence — shown, never hidden".
2. **Clusters** — bordered cards per cluster: summary, shared mechanism, members,
   reusable assets, gaps, next experiment, plus an "Open in Explore" jump.
3. **Patient Action** — disease picker; shared assets, clinical pathways
   (trials/papers), partner orgs (with org URL buttons), next experiments. Leads are
   visually split: green "✅ viable lead" (observed + high/medium confidence) vs amber
   "🟡 thin link — needs evidence" (inferred or low confidence).
4. **Maria's Journey** — guided step-through (Back/Next + progress bar) from
   `journeys.maria.steps`, each step resolving its node for label/type/description;
   10× case in a blue callout box; assumptions listed as "stated, not hidden".
- Missing/corrupt `data/graph.json` → a friendly "data is being built" state and
  `st.stop()`. Never crashes, never invents data.

## Decisions and why
- **streamlit-agraph over pyvis**: pyvis embeds in an iframe with no clean way to
  return node clicks to Streamlit; streamlit-agraph wraps vis-network as a real
  component whose `selectNode` handler returns the clicked node id, enabling the
  click → detail-panel requirement. Installed into `~/workspace/.venv`
  (streamlit-agraph).
- **Tabs as `st.segmented_control`** instead of `st.tabs`: identical pill-tab UX, but
  programmatic switching works, so Clusters' "Open in Explore" can actually jump tabs.
- **No node tooltips**: streamlit-agraph's double-click handler runs
  `window.open(node.title)` — any title text opens a broken tab. Titles are empty by
  design; all node info lives in the detail panel.
- **Low-ink styling**: one small `<style>` block (cards, badges, tags, whitespace);
  no gradients, no hero images. Type colors follow the 10-type palette from the brief.
- **One file, plain functions**: Charan edits his own code — kept it a single readable
  file with section comments, no classes/frameworks.

## What worked
- `AppTest` (streamlit.testing.v1) drove the whole verification: missing-graph state,
  exact/ambiguous/no-match search, all four tabs, Maria step-through, detail panel
  edge cards (contradiction banner, PMID/NCT links, confidence badges), Patient Action
  viable/thin split — all with zero exceptions.
- Headless `streamlit run` serves with HTTP 200 on `/_stcore/health`.

## What didn't and why
- **Magic-mode ternary statement** (`node_detail(x) if x else st.info(...)` as a bare
  statement) crashed Streamlit's magic `ast.parse` — rewrote as a normal if/else.
- **Lambda typo** `not viable(e[0])` instead of `not viable(x[0])` in Patient Action
  sorting — caught by AppTest on the trials bucket.
- **Misread agraph return type**: assumed a list, but the component returns a plain
  node-id string — indexing `[0]` would have taken the first character. Fixed to
  treat it as a scalar.
- **Ambiguous search demo**: "gaucher" (not "gaucher disease") correctly yields
  candidate buttons rather than auto-picking — intended behavior, not a bug.

## Pending on the graph file
- `data/graph.json` does not exist yet (data agent still building). The app currently
  shows only the "being built" state — this is correct and expected.
- A temporary 8-node test graph was used for verification and **deleted**; no mock
  data ships in the app or the repo.
