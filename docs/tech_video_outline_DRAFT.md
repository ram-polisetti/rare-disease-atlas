# Technical video script (60 seconds max)

How you built it, what worked, what didn't, key tools. Record with the repo or the README pipeline section on screen, then the live site.

**0:00 to 0:20, how I built it** [Repo scripts folder or README.]
"A scripted pipeline pulls public sources: Mondo, HPO, ClinVar, Orphanet, ClinicalTrials.gov, and PubMed abstracts. A language model extracts claims, and every claim must carry a verbatim quote: 944 of 949 passed quote verification. A claim only enters the graph if its entities already exist, so nothing is invented."

**0:20 to 0:32, key tools** [Live site.]
"Python for the pipeline. Plain JavaScript and vis-network for the site. One JSON file, no backend, hosted on GitHub Pages. AI coding agents did scoped work under my direction; I made every call on scope, sources, and claims."

**0:32 to 0:46, what worked** [Explore tab, click an edge, show the evidence panel.]
"Quote verification caught bad extractions before they reached the graph. Every link carries its evidence type, confidence, source, and date, shown as a plain confidence badge. Disagreements are kept as contradiction edges, not hidden."

**0:46 to 1:00, what didn't** [Clusters tab.]
"The first clustering run lumped unrelated diseases together, because funding and trial edges swamp biology. Restricting clusters to mechanism edges fixed it, and each cluster card states that a shared mechanism does not mean a treatment transfers."
