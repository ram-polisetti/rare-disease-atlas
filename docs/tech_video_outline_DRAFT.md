# DRAFT: Technical video outline (60 seconds max)

**Status: DRAFT, awaiting Charan's review. Charan records and narrates this himself. Nothing here is final without his go-ahead.**

About 140 words. Keep the counts approximate ("about 1,550 nodes") since the build is still changing.

## Script

**0:00 to 0:12, the problem** [Live site on the Guide tab.]
"Rare diseases are rare one at a time and common together. Evidence for related conditions sits in separate databases, papers, and trial registries. The atlas links it into one knowledge graph a family or a researcher can read."

**0:12 to 0:32, the pipeline** [Show the README pipeline section or the repo scripts folder.]
"A scripted pipeline pulls Mondo, HPO, ClinVar, Orphanet, ClinicalTrials.gov, and PubMed abstracts. A language model extracts claims, and every claim must carry a verbatim quote: 944 of 949 passed quote verification. Nothing is invented. A claim only enters the graph if its entities already exist."

**0:32 to 0:45, grounding** [Explore tab: click an edge, show the evidence panel.]
"Every link carries its evidence type, confidence, source, and date, shown as a plain confidence badge. Disagreements are kept as contradiction edges on their own tab, not hidden."

**0:45 to 1:00, what did not work, and the stack** [Clusters tab, then the site.]
"What did not work: the first clustering run lumped unrelated diseases together, because funding and trial edges swamp biology. Restricting clusters to mechanism edges fixed it. The stack is a static site, one JSON file, no backend, on GitHub Pages. Every claim traces to a source, and the pipeline can be pointed at the next disease family."
