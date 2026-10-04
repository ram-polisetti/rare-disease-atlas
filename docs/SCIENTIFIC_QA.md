# Scientific QA audit of the site copy

Date: 2026-10-04. Auditor: Claude (Opus 5.5), read-only pass for Charan.
Scope: UI copy in `site/index.html`, `site/app.js`, `site/views.js`, `site/guide.js`, `site/whatif.js`, `site/endpoints.js`, plus the `graph.json` text those files render (treatment status, 10x case, Maria's journey).
Snapshot: files copied at the start of the audit, while a Codex run was editing `site/`. Line numbers may have shifted since. Search by the quoted text, not the line number.

Nothing in `site/` was edited. Every fix below is a proposed replacement for the human coordinator to apply.

Severity key: **High** = factually wrong or could mislead a family or a regulator-minded judge. **Medium** = overstated or loosely worded. **Low** = polish or needs a source check.

## Issues

### 1. High: Lyso-Gb1 is defined as the Fabry molecule, and Gaucher and Fabry are described as sharing one biomarker

- **Where:** `site/endpoints.js` line ~51, endpoint `ep-lysogb1`.
- **What is wrong:** The card is titled "Lyso-Gb1" but defines it as "Globotriaosylsphingosine", which is lyso-Gb3. Lyso-Gb1 is glucosylsphingosine, the Gaucher (GBA1) biomarker. Lyso-Gb3 (globotriaosylsphingosine) is the Fabry (GLA) biomarker. They are different molecules, measured as different analytes. The card then says the two communities "could co-validate assay platforms, reference ranges, and what counts as a meaningful change", which is not true for reference ranges or meaningful change, since the analyte differs.
- **Why it matters:** This is the one place a clinician judge will spot instantly. It also undercuts the "Sharing a measurement is not sharing biology" message, because here the measurement itself is not shared.
- **Corrected wording (split into two cards, or keep one card with this text):**
  - term: `Lyso-sphingolipids (lyso-Gb1 / lyso-Gb3)`
  - plain: `fatty substances that build up in the blood`
  - what: `Two related blood markers of substrate buildup: glucosylsphingosine (lyso-Gb1) in Gaucher disease and globotriaosylsphingosine (lyso-Gb3) in Fabry disease. They are different molecules, each specific to its own disease.`
  - share: `Both are measured by similar mass-spectrometry methods, so the two communities could share lab platforms and quality-control practice. Reference ranges and what counts as a meaningful change must still be set separately for each marker.`
  - Also rename the id/label wherever "Lyso-Gb1" appears alone next to Fabry (the Guide's "Measurements researchers share" list and the Endpoints matrix both render `ep.term`).

### 2. High: Sulfatides attributed to Krabbe disease

- **Where:** `site/endpoints.js` line ~66, endpoint `ep-sulfatide` (`genes: ['ARSA', 'GALC']`).
- **What is wrong:** Sulfatide accumulation is the hallmark of metachromatic leukodystrophy (ARSA deficiency). Krabbe disease (GALC deficiency) accumulates psychosine (galactosylsphingosine), not sulfatides. The card says "MLD and Krabbe could share sulfatide assay validation", which pairs Krabbe with the wrong analyte. Because derivation is gene-based, Krabbe is placed in this endpoint row by the code.
- **Why it matters:** Same failure mode as issue 1: a shared-biomarker claim that is biochemically wrong.
- **Corrected wording:**
  - what: `Sulfatide buildup tracks demyelination in metachromatic leukodystrophy (MLD). Krabbe disease stores a different molecule, psychosine.`
  - share: `MLD and Krabbe are both leukodystrophies, so they could share myelin-imaging and nerve-conduction protocols. The lab markers differ: sulfatides for MLD, psychosine for Krabbe.`
  - Code note for the coordinator: change `genes` to `['ARSA']`, or keep GALC but make the label say the shared part is the myelin protocol, not the assay.

### 3. High: NfL described as "increasingly accepted by regulators as a surrogate"

- **Where:** `site/endpoints.js` line ~76, endpoint `ep-nfl`, field `what`.
- **What is wrong:** The only regulatory precedent I can stand behind is narrow: FDA's 2023 accelerated approval of tofersen in SOD1-ALS used reduction in plasma NfL as a "reasonably likely" surrogate. NfL is not an accepted surrogate for any lysosomal storage disease, and it is not specific to any disease (it rises with neuronal injury from many causes). "Increasingly accepted by regulators" reads as a general acceptance that does not exist.
- **Why it matters:** The brief asked for no language implying regulatory acceptance beyond what is established. This sentence does exactly that.
- **Corrected wording:** `Rises when nerve cells are damaged, from many different causes. FDA has accepted it once as a "reasonably likely" surrogate (tofersen, SOD1-ALS, 2023). It is not validated as an endpoint for any lysosomal disease yet.`
- The tier heading "Nerve-damage signals in blood (still being validated)" is correct. Keep it.

### 4. Medium: GFAP framed without its validation status

- **Where:** `site/endpoints.js` line ~82, endpoint `ep-gfap`.
- **What is wrong:** The biology ("marks astrocyte activation") is fine. The card does not say GFAP is a research biomarker with no regulatory standing in these diseases, and "brain-inflammation signal" overstates specificity (GFAP rises with astrocyte injury or activation of many kinds).
- **Corrected wording:**
  - plain: `a blood signal from stressed brain support cells`
  - what: `Glial fibrillary acidic protein, released when astrocytes (brain support cells) are activated or injured. A research biomarker: not validated as a trial endpoint in any lysosomal disease.`
  - share: keep `Could ride along with NfL validation as a paired CNS panel.`

### 5. Medium: "10x" label on a modeled 2.5-fold reduction

- **Where:** tab label `The 10x Case` (`site/index.html` line 39); `site/app.js` lines ~77 and ~1094 to ~1125; `site/whatif.js` lines ~202, ~205, ~317.
- **What is wrong:** The modeled numbers are 5.5 years baseline and 2.2 years shared. That is a 2.5-fold reduction (60%, about 3.3 years saved), not tenfold. The copy itself is honest ("modeled estimates, not measured results"), but a reader who sees "10x" next to 5.5 vs 2.2 will either think the math is wrong or that we are inflating it.
- **Why it matters:** The 10x case must stay framed as a modeled estimate. A headline multiplier that the numbers do not support is drift, even if the body text is careful.
- **Corrected wording:** add one sentence to the intro box in `initImpact()`, right after "These are modeled estimates, not measured results": `"10x" is the challenge's goal for how much faster rare-disease research should move. This one example models about a 2.5-fold speedup (60% less time); it is a modeled estimate, not a measured result.`
- And change the tab description in `TAB_DESCS.impact` (app.js ~77) from `One worked example: how sharing could cut a study from 5.5 years to 2.2.` to `One modeled example: how sharing might shorten a Sanfilippo A study from an estimated 5.5 years to about 2.2.`

### 6. Medium: What If links to a tab name that does not exist

- **Where:** `site/whatif.js` lines ~205 and ~317: "See the 10&times; Impact tab" and "(see 10&times; Impact tab)".
- **What is wrong:** The tab is labeled "The 10x Case". There is no "10x Impact" tab, so a user cannot follow the pointer.
- **Corrected wording:** `See The 10x Case tab for the modeled phase breakdown and stated assumptions.` and `~2.2 yrs shared, modeled (see The 10x Case tab)`.
- Note the second one also adds "modeled", since the comparison table cell currently shows "~2.2 yrs shared" without that word.

### 7. Medium: HPO-derived endpoint rows look like established endpoint use

- **Where:** `site/endpoints.js` tier 3 and 4 entries (lines ~90 to ~136), and `site/guide.js` line ~1660, heading "Measurements researchers share".
- **What is wrong:** For tier 3/4 endpoints, a disease joins a row when any of its HPO phenotypes matches a keyword regex. Several regexes are broad: `/cardiac/` matches any cardiac abnormality term, `/pulmonary/` matches pulmonary hypertension or pulmonary infiltrates, `/retin|corneal/` matches any retinal or corneal term, and the 6-minute-walk regex includes `motor delay`, which is an infant finding where a walk test cannot be done. HPO annotations also carry no frequency in this view, so a phenotype seen in a few patients counts the same as a defining one. The Guide heading "Measurements researchers share" then presents the result as something researchers already do.
- **Why it matters:** The data supports "this disease has a recorded symptom in this area", not "this disease is measured this way in trials".
- **Corrected wording:**
  - Guide heading: `Measurements that could be shared` with a fine-print line under it: `Matched from recorded symptoms, not from trial protocols. Whether each test suits this condition needs a specialist's review.`
  - Endpoint labels, e.g. `In our graph: diseases sharing HPO cardiac phenotypes` becomes `In our graph: diseases with at least one recorded heart-related symptom (keyword match on HPO terms; not a confirmed trial endpoint)`. Apply the same pattern to the seizure, motor, hearing, eye, developmental, respiratory, organ, and brain-imaging rows.
  - Code note: drop `motor delay` from the 6MWT regex, or add to the 6MWT caveat: `Not usable in infants or young children who are not yet walking.`

### 8. Medium: Chitotriosidase assigned to diseases where it is not a recognized marker

- **Where:** `site/endpoints.js` line ~56, endpoint `ep-chito`, `genes: ['GBA', 'SMPD1', 'NPC1', 'NPC2', 'GLA', 'GALC', 'ARSA']`.
- **What is wrong:** Chitotriosidase is a recognized marker in Gaucher disease and is elevated in Niemann-Pick A/B and C. It is not a standard marker in Fabry, Krabbe, or MLD. The card also omits that about 6% of people carry two copies of a common CHIT1 duplication and have no measurable activity, which limits it even in Gaucher.
- **Corrected wording:**
  - label: `In our graph: Gaucher and Niemann-Pick diseases, where this marker is most used`
  - caveat: `Low specificity: a shared number here does not mean shared disease activity. About 1 in 20 people carry a common gene variant that makes the enzyme unmeasurable.`
  - Code note: reduce `genes` to `['GBA', 'SMPD1', 'NPC1', 'NPC2']`.

### 9. Medium: 6-minute walk test regulatory wording

- **Where:** `site/endpoints.js` line ~96, `ep-walk`, field `what`.
- **What is wrong:** "FDA-accepted functional endpoint ... validated in Pompe" is broadly right but loose. The specific, checkable fact is that 6MWT was a primary endpoint in the late-onset Pompe trial (LOTS) that supported FDA approval of alglucosidase alfa. "Validated in Pompe" also does not extend to infantile-onset Pompe.
- **Corrected wording:** `A walking test FDA has accepted as a primary endpoint before: it was used in the late-onset Pompe trial that supported approval of alglucosidase alfa.`

### 10. Medium: Hexosaminidase A described as "same assay, same meaning"

- **Where:** `site/endpoints.js` line ~61, `ep-hexa`, field `share`.
- **What is wrong:** In Tay-Sachs only Hex A is deficient; in Sandhoff both Hex A and Hex B are deficient, so the assay pattern differs. Enzyme activity is also mainly a diagnostic test, not an established response endpoint (gene-therapy trials measure it, but meaning differs by disease).
- **Corrected wording:** `The most direct shared measurement: the same enzyme assay is used in both diseases. Results read differently (Sandhoff also lowers Hex B), so the two would share lab methods, not cut-offs.`

### 11. Low: "A shared assay protocol already exists" for HS+DS

- **Where:** `site/endpoints.js` line ~47, `ep-ds`, field `share`.
- **What is wrong:** I could not find a source in the graph for an existing cross-community HS+DS assay protocol. The underlying fact (MPS I and II trials often measure HS and DS together) is fine.
- **Corrected wording:** `MPS I and II trials often measure HS and DS together, so the two communities already use overlapping lab methods.`

### 12. Low: Family-story box implies partnerships that do not exist

- **Where:** `site/views.js` line ~1147, `familyStoryHTML`.
- **What is wrong:** "Stories are contributed through partner patient organizations, with consent" describes a process as if partners are in place. The README states the National MPS Society has not agreed to anything.
- **Corrected wording:** `No families have shared stories linked here yet. If this feature is built, stories would come through patient organizations, with consent, and would always be kept separate from scientific evidence.`

### 13. Low: Fayuvi trial details need a primary-source check

- **Where:** `site/whatif.js` line ~216, and `graph.json` `journeys.maria.ten_x.assumptions` and step 1 `why` (rendered on Journey and The 10x Case).
- **What is wrong:** Not necessarily wrong. "Single-arm study (N=17) vs an external natural-history control (N=27)" is sourced to a news article (medicaldaily.com), not to the FDA label or review. The Maria step also says the label "lists zero contraindications" and names "no age cutoff". These are checkable against the Prescribing Information (Revised 09/2026) and should be, before judges read them.
- **Corrected wording (if not verified in time):** `Fayuvi's FDA approval relied on a single-arm study compared with an external natural-history control, as reported at approval.` (drop the N values until checked against the label or FDA review memo).

### 14. Low: "Symptoms families often notice" overstates frequency

- **Where:** `site/guide.js` line ~1656.
- **What is wrong:** The list is the first 10 HPO annotations, with no frequency filter. Some are uncommon.
- **Corrected wording:** heading `Symptoms recorded for this condition`. Keep the existing line "Every child is different ... Only a clinician can diagnose."

### 15. Low: Confidence percentages look calibrated

- **Where:** `site/views.js` line ~1088, `thermoLevel()` (pct 18 / 38 / 80 / 92 / 100).
- **What is wrong:** If these numbers are ever shown as text, they read as probabilities. They are fixed fill levels for a visual bar. The labels themselves are good.
- **Fix:** do not display the numbers. If a screen reader announces them via `aria-valuenow`, replace that with the label text (`aria-valuetext`).

## Verified as correct

- **"Sharing a measurement is not sharing biology."** Present in `endpoints.js` (EP_CAVEAT, ~156) and `guide.js` (~1669). Preserved. No change.
- **Fabry treatment status.** Graph has `treats` edges for Fabrazyme (agalsidase beta), Galafold (migalastat), and Elfabrio (pegunigalsidase alfa) to Fabry disease. The site never says Fabry has no approved treatment.
- **Fayuvi.** Rendered as FDA-approved September 17, 2026, for pediatric MPS IIIA with preserved neurodevelopmental function. Matches the known fact. What If Scenario B correctly calls the label narrow.
- **No false "no approved treatment" claims.** Where a disease has no `treats` edge, the copy says "Our data does not record a treatment for this disease. This does not establish whether approved treatments exist" (`app.js` ~1266, `views.js` ~1289). That is the right wording. Note for the coordinator: several diseases in the slice have approved therapies that are not in the graph (Gaucher, Pompe, MPS I, MPS II, Niemann-Pick C, ASMD, MLD). The wording protects us, but the README should say treatment coverage is partial (it does now).
- **10x case framing.** `initImpact()` states "These are modeled estimates, not measured results" and lists assumptions, including "the savings here are modeled, not cited". What If says "Based on the modeled 10x case". Only the tab name and tab description drift (issue 5).
- **Heparan sulfate.** HS builds up in MPS I, II, and III; MPS trials use HS reduction. Correct.
- **Hearing loss** common across MPS types and Fabry. Correct.
- **Cherry-red spot / corneal clouding** examples for eye exams. Correct for GM2 gangliosidoses, Niemann-Pick A, and MPS.
- **Developmental scales (Bayley, Vineland)** used in MPS III trials. Correct.
- **Oxysterols** best established in Niemann-Pick C (diagnostic use), also raised in ASMD. Correct as written.
- **Cardiac MRI** for left-ventricular mass and fibrosis in Fabry. Correct.
- **Trial cautions.** "Most experimental treatments never become approved medicines" and "Research studies are early steps, not approved treatments" (`guide.js`). Accurate and appropriately calm.
- **Diagnosis language.** "This comparison cannot confirm a diagnosis" and "Only a clinician can diagnose" appear in the Guide. Good.
- **Glossary** entries for ERT ("often cannot reach the brain"), gene therapy, AAV, trial phases, compassionate use, off-label (`views.js` ~694 to ~780). Accurate.
- **Newborn screening precedent.** MPS I is on the US Recommended Uniform Screening Panel, so "screening inclusion is achievable for this disease family" holds.
