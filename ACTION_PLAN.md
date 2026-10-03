# ACTION PLAN — AI Atlas for the World's Rare Diseases
Hack-Nation 7, Challenge 05 (OpenAI x Buffalo Initiative). Solo builder: Charan.
Submission deadline: **Sun Oct 4, 9:00 AM ET sharp.** All deliverables ready by 8:00 AM.

## Team
Solo build by Ram Charan Polisetti.

## The idea (one paragraph)
A knowledge graph of lysosomal storage diseases (LSDs): diseases, genes, variants,
phenotypes, pathways, papers, trials, patient orgs, reusable research assets.
Every edge cites its evidence. Clustering is by shared mechanism, never by name.
The demo follows Maria, a Sanfilippo (MPS IIIA) parent-group leader with no approved
treatment, from her disease to the shared heparan-sulfate pathway to MPS I and MPS II
(which have approved enzyme replacement therapies), ending in a sourced collaboration
proposal: reusable study designs, researchers, and patient orgs.

## Phases (tech side first, UI last — Charan's call)
1. **Data expansion** — add MPS II (IDS) and MPS IIIA/B/C/D (SGSH, NAGLU, HGSNAT, GNS)
   to the slice: MONDO, HPO, ClinVar, PubMed, ClinicalTrials.gov, Monarch, National MPS
   Society org node. Target: ~5 PM Sat.
2. **Graph build** — rebuild data/graph.json with the expanded slice, mechanism mapping
   (GAG / heparan-sulfate pathways), rewritten Maria journey (Sanfilippo start), 10x case
   with stated assumptions. Codex extracts gene-variant-mechanism claims from PubMed
   abstracts; edges merged with confidence levels and observed/inferred flags.
   Target: ~9 PM Sat.
3. **Static UI** — single-page site in `site/`: one global search (synonym-resolved),
   disease view, pathway neighbors, per-edge evidence, Patient Action View, Maria's
   Journey click path. Reads site/graph.json. No backend. Target: ~1 AM Sun.
4. **Polish + README + repo + video scripts** — README (architecture + how to reproduce
   the dataset), 1-minute walkthrough script (Sanfilippo click path, timed), team video
   outline. Target: ~5 AM Sun.
5. **Deploy + verify** — GitHub Pages live, final checklist against the 5 deliverables.
   Target: ~7:30 AM Sun.

## Deliverables (from the brief + event rules)
- Public GitHub repo (this one) with README covering architecture and dataset reproduction
- Deployed demo (GitHub Pages, no localhost)
- Demo video, tech video, team video (Charan records; scripts provided)
- Submission on app.hacknation.ai + backup Google Form (Charan clicks submit)

## How Charan stays involved
Milestone reports land in the main chat at each phase: what was built, the evidence
(link/file), blockers. Every step is documented in
`~/fleetrepo/project-logs/P26-rare-disease-atlas.md`. Nothing is "done" until verified
against the source.
