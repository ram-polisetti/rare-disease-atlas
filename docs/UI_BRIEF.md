# Phase 3 UI brief — static single-page atlas (Codex executor)

## Objective
A static single-page web app in `site/` that makes the rare-disease knowledge graph
(`data/graph.json`) explorable by the four brief personas (Maria: patient-org leader,
Devon: newly diagnosed, Priya: biotech scout, Dr. Osei: researcher). This is the
**deployed demo** the judges open. It must be screen-recordable: the 1-minute
walkthrough video is recorded against this UI.

## Hard constraints
- **Static only**: vanilla HTML + CSS + JS, no build step, no framework, no backend.
- **Data**: `site/graph.json` (copy of `data/graph.json`) loaded via `fetch('./graph.json')`.
  Must work both from `file://` and from GitHub Pages. Copy the file as part of the build.
- **Graph rendering**: vis-network via CDN (use the pinned UMD build, e.g.
  `https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js`).
- **Deploy target**: GitHub Pages serves `site/` as root. All asset paths relative.
- **Low ink, high signal** (brief's design principle): light background, minimal chrome,
  thin edges, restrained color (one accent color for selection, grayscale + one hue for
  node types), generous whitespace, system font stack. No gradients, no shadows-heavy cards.

## The four views (top nav tabs)
1. **Explore** — the main graph view:
   - One global search box (top): resolves via the graph's `synonyms` map (diseases, genes,
     symptoms). Typing filters to a suggestion list; Enter/click centers the node.
   - vis-network canvas showing the selected node's 1-hop neighborhood by default
     (progressive reveal: a control expands to 2 hops; a "cluster only" toggle limits to
     the node's cluster members).
   - Node color by `type` (disease/gene/variant/phenotype/paper/trial/patient_org/
     researcher/mechanism/asset/funding); edge width by confidence (high=2px, medium=1.5, low=1).
   - **Explain every edge** (brief requirement): clicking any edge opens a side panel with
     the plain-language `note`, `source_db`, `source_ref` (rendered as a link when it is a
     URL/PMID/NCT), `confidence`, `evidence`, `date`, and the `contradicts` flag when true.
     Clicking a node shows its label, type, description, synonyms, and its edges grouped
     by relation.
2. **Clusters** — the 7 mechanism clusters as cards (label, summary, member count,
   shared_mechanism, reusable_assets, gaps, next_experiment). Clicking a card loads its
   members into the Explore canvas.
3. **Patient Action** — for a selected disease (defaults to MPS IIIA): actionable panel —
   active clinical trials (trial nodes, NCT links), patient orgs (with URLs), reusable
   assets (registries, natural-history studies), and open research gaps. Written for
   Maria/Devon: what can a family DO this week.
4. **Maria's Journey** — the 8-step Sanfilippo A journey from `graph.json`:
   a stepper (Step 1/8 … 8/8) that highlights each journey node on a mini-canvas and shows
   the `why` text plus the supporting edge note. Prev/Next buttons + keyboard arrows.

## The screen-recordable Sanfilippo click path (must work flawlessly)
The 1-minute walkthrough records exactly this, so it must be deterministic and clean:
1. Page loads → Explore view, search box focused.
2. Type "sanfilippo" → suggestion "Sanfilippo A (MPS IIIA)" → click.
3. Canvas centers MPS IIIA node with 1-hop neighborhood; side panel shows description.
4. Click the SGSH gene node → panel shows gene description + edge to MPS IIIA with note.
5. Click "Maria's Journey" tab → stepper at Step 1 → click Next through all 8 steps.
6. Click "Patient Action" tab → trials + orgs + assets for MPS IIIA visible.
No console errors, no layout shift, every click visibly responds within ~200ms on the
shipped graph size (~1.6k nodes). Test this path manually after building.

## Data details
- Node ids are stable (MONDO:/HGNC:/atlas:/PMID:/NCT). Edge `source_ref` values like
  `PMID:12345678` link to `https://pubmed.ncbi.nlm.nih.gov/12345678/`;
  `NCT...` links to `https://clinicaltrials.gov/study/NCT...`;
  `RePORTER:...` links to `https://reporter.nih.gov/project-details/<number>`.
- The full graph is ~1.6k nodes / ~4k edges: NEVER render all at once. Default views are
  neighborhood-scoped (see above). Provide a "load cluster" cap (~150 nodes) with a note
  when truncated.

## Build steps (Codex)
1. Copy `data/graph.json` → `site/graph.json`.
2. Write `site/index.html`, `site/styles.css`, `site/app.js` (keep it to these three files
   plus graph.json).
3. Open the page (via a local server or file://) and walk the Sanfilippo click path above;
   fix every glitch. Verify no console errors.
4. Do NOT commit (coordinator commits). Final message: files written, click-path test result.

## Out of scope
No user accounts, no analytics, no backend, no additional pages. One page, four tabs.
