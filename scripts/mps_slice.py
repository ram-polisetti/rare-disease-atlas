"""Sourced MPS natural-history design candidates and Maria's journey."""
import json
from pathlib import Path

GAG = 'atlas:mech-glycosaminoglycan-catabolism'
MPS_I = 'MONDO:0001586'
MPS_II = 'MONDO:0010674'
MPS_IIIA = 'MONDO:0009655'
ORG = 'atlas:org-national-mps-society'
ASSET = 'atlas:asset-mps-natural-history-design'
PROPOSAL = 'atlas:asset-cross-disease-proposal'
FDA_IIIA = 'https://www.fda.gov/media/194921/download'
FDA_I = 'https://www.accessdata.fda.gov/drugsatfda_docs/appletter/2003/larobio043003L.htm'
FDA_II = 'https://purplebooksearch.fda.gov/index.cfm?blaNo=125151&event=productdetails'
REGISTRY_I = 'https://clinicaltrials.gov/study/NCT00144794'
REGISTRY_II = 'https://clinicaltrials.gov/study/NCT03292887'


def disease_map(mondo):
    out = {}
    for d in mondo['diseases']:
        label = d['label']
        if label.startswith('mucopolysaccharidosis type 2'):
            out.setdefault('Mucopolysaccharidosis type II', []).append(d['mondo_id'])
        for suffix in 'ABCD':
            if label == 'mucopolysaccharidosis type 3' + suffix:
                out['Mucopolysaccharidosis type III' + suffix] = [d['mondo_id']]
    return out


def add_assets(add_node, add_edge, nodes, data):
    protocols = json.loads((Path(data) / 'raw/mps_registry_protocols.json').read_text())
    eligibility = {nct: p['study']['protocolSection']['eligibilityModule']
                   for nct, p in protocols.items()}
    deltas = [
        {'field': 'diagnosis', 'source_nct': 'NCT00144794',
         'source_rule': 'MPS I: alpha-L-iduronidase deficiency and/or IDUA mutations, or measurable MPS I signs and symptoms.',
         'proposed_check': 'Replace with a clinician-approved MPS IIIA definition using SGSH genotype and/or sulfamidase deficiency; do not reuse an MPS I clinical-only entry rule.'},
        {'field': 'diagnosis', 'source_nct': 'NCT03292887',
         'source_rule': 'Biochemical and/or genetic diagnosis of Hunter syndrome.',
         'proposed_check': 'Replace IDS/MPS II confirmation with SGSH/MPS IIIA confirmation; adjudicate subtype and residual enzyme activity.'},
        {'field': 'concurrent_trials', 'source_nct': 'NCT03292887',
         'source_rule': 'Interventional trial participants excluded until completed or withdrawn.',
         'proposed_check': 'Decide whether to include Sanfilippo interventional-trial participants in a separate stratum. MPS I registry explicitly permits other studies.'},
        {'field': 'treatment_exposure', 'source_nct': 'NCT03292887',
         'source_rule': 'ERT other than Elaprase excludes participation until stopped.',
         'proposed_check': 'Replace Elaprase-specific restriction with documented MPS IIIA gene-therapy and investigational-treatment exposure strata; an untreated baseline must not mix treated trajectories.'},
        {'field': 'consent_and_capacity', 'source_nct': 'NCT03292887',
         'source_rule': 'Parent/LAR consent below 18 years (below 16 in Scotland), minor assent where applicable, and LAR consent for cognitive impairment.',
         'proposed_check': 'Review jurisdiction-specific guardian consent, assent and cognitive-capacity provisions for children with progressive neurodevelopmental loss.'},
        {'field': 'age_and_neurodevelopment', 'source_nct': 'NCT00144794',
         'source_rule': 'Children, adults and older adults; no exclusion criteria.',
         'proposed_check': 'Predefine age, baseline developmental level and disease-stage strata for Sanfilippo; registry inclusion must be distinguished from Fayuvi treatment eligibility.'},
    ]
    add_node(ASSET, 'asset', 'Shared MPS I/II natural-history study design',
        description='Candidate design reuse from the MPS I Registry and Hunter Outcome Survey: longitudinal visit structure, diagnosis confirmation, consent and treatment-exposure stratification. Adapt neurological endpoints for MPS IIIA.',
        extra={'stage': 'candidate_design_reuse', 'source_refs': [REGISTRY_I, REGISTRY_II],
               'source_eligibility': eligibility, 'eligibility_deltas': deltas,
               'access_status': 'Public protocols available; participant data access and reuse permissions unverified.'})
    for disease, url in [(MPS_I, REGISTRY_I), (MPS_II, REGISTRY_II), (MPS_IIIA, REGISTRY_I)]:
        add_edge(disease, ASSET, 'reuses_asset', 'inferred', 'medium', 'ClinicalTrials', url,
                 'Published registry design is a reuse candidate; subtype eligibility, neurological endpoints, data rights and treatment exposure require review.')
    add_edge(ORG, ASSET, 'reuses_asset', 'inferred', 'medium', 'ClinicalTrials', REGISTRY_II,
             'Proposal for National MPS Society to evaluate the public Hunter and MPS I registry designs; no registry ownership or agreed collaboration is asserted.')
    nodes[PROPOSAL]['description'] = ('Proposal for an MPS IIIA natural-history collaboration: adapt the MPS I Registry and Hunter Outcome Survey protocols, explicitly reviewing SGSH diagnosis, neurodevelopmental stage, consent and treatment exposure.')
    nodes[PROPOSAL]['extra'].update(source_refs=[REGISTRY_I, REGISTRY_II],
                                  eligibility_deltas=deltas, stage='proposal')
    nodes[PROPOSAL]['extra']['cross_disease_translation_precedent'] = {
        'drug': 'miglustat (Zavesca)',
        'scope': 'Translation precedent only; no Sanfilippo treatment or efficacy claim.',
        'us_indication': 'Adults with mild to moderate Gaucher type 1 for whom ERT is not a therapeutic option; US Zavesca label does not include Niemann-Pick C.',
        'eu_indications': 'Gaucher type 1 when ERT is unsuitable; progressive neurological manifestations of Niemann-Pick C.',
        'source_refs': ['https://www.ema.europa.eu/en/medicines/human/EPAR/zavesca',
            'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=817892d1-ee12-4632-85fc-57ccdf16d7b8&type=display']}
    add_edge(PROPOSAL, ASSET, 'reuses_asset', 'inferred', 'medium', 'ClinicalTrials', REGISTRY_II,
             'Proposed cross-disease collaboration reuses public MPS I/II study designs after eligibility-delta review; data sharing and endpoint transfer are not established.')
    nodes[MPS_IIIA]['extra']['therapy_status'] = {
        'as_of': '2026-10-03', 'source_ref': FDA_IIIA,
        'note': 'Fayuvi FDA-approved September 17, 2026 for neurologic manifestations in pediatric MPS IIIA patients with preserved neurodevelopmental function.'}
    for mid, drug, date, url in [(MPS_I, 'laronidase (Aldurazyme)', '2003-04-30', FDA_I),
                                (MPS_II, 'idursulfase (Elaprase)', '2006-07-24', FDA_II)]:
        nodes[mid]['extra']['ert_precedent'] = {'drug': drug, 'fda_approval_date': date, 'source_ref': url}


def journey():
    steps = [
        {'node': MPS_IIIA,
         'why': 'Maria is a composite Sanfilippo A family advocate seeking a natural-history study plan. Fayuvi was FDA-approved September 17, 2026 for pediatric MPS IIIA with preserved neurodevelopmental function; eligibility needs clinical assessment.',
         'edge_note': 'MONDO disease; current approval source: ' + FDA_IIIA},
        {'node': 'HGNC:10818', 'why': 'SGSH encodes sulfamidase: variants cause Sanfilippo A.',
         'edge_note': 'MPS IIIA caused_by_variant_in SGSH; Monarch/OMIM and Orphanet curated gene-disease associations.'},
        {'node': GAG, 'why': 'SGSH acts in lysosomal heparan-sulfate degradation, within GAG catabolism. Shared substrate biology identifies study-design neighbors.',
         'edge_note': 'SGSH disrupts_pathway GAG/heparan-sulfate catabolism; inferred, medium confidence, based on Orphanet/Monarch gene annotations.'},
        {'node': MPS_I, 'why': 'MPS I is a GAG-catabolism neighbor with laronidase ERT precedent (FDA-approved April 30, 2003) and a published registry design. Somatic ERT outcomes cannot be assumed to transfer to Sanfilippo neurological outcomes.',
         'edge_note': 'MPS I has_mechanism GAG catabolism (inferred); FDA precedent: ' + FDA_I + '; registry: ' + REGISTRY_I},
        {'node': MPS_II, 'why': 'Hunter syndrome is another GAG neighbor: idursulfase ERT was FDA-approved July 24, 2006. Hunter Outcome Survey supplies concrete consent and treatment-exposure rules to compare.',
         'edge_note': 'MPS I shares_pathway MPS II (inferred, medium); FDA: ' + FDA_II + '; HOS: ' + REGISTRY_II},
        {'node': ORG, 'why': 'National MPS Society supports families affected by MPS I, II and III and is a potential convenor for reviewing a shared study design.',
         'edge_note': 'MPS II advocated_by National MPS Society, observed/high/manual: https://mpssociety.org'},
        {'node': ASSET, 'why': 'Reuse public MPS I/II registry designs, then check diagnosis, concurrent trials, treatment exposure, consent, age and developmental stage. Public design availability does not imply access to participant data.',
         'edge_note': 'Society reuses_asset is an inferred proposal, not an existing agreement; source protocols: ' + REGISTRY_I + ' and ' + REGISTRY_II},
        {'node': PROPOSAL, 'why': 'Propose a clinician-led Sanfilippo natural-history collaboration with explicit eligibility deltas and neurological endpoints; separate treated and untreated trajectories.',
         'edge_note': 'Proposal reuses_asset shared MPS design (inferred/medium), sourced to ' + REGISTRY_I + ' and ' + REGISTRY_II},
    ]
    return {'maria': {'start': MPS_IIIA, 'steps': steps,
        'ten_x_case': 'Planning estimates, not measured costs or promised outcomes: designing and launching a standalone natural-history study may take a patient group roughly 2–3 years and ~$500K+. The atlas identifies reusable MPS I/II registry study designs and explicit eligibility deltas, potentially compressing the decision about what to do next from years to weeks (estimated 2–6 weeks for a reviewed plan). This does not compress cohort follow-up into weeks or guarantee study launch, regulatory acceptance or treatment approval.',
        'assumptions': [
            'The 2–3 years, ~$500K+ and 2–6 weeks are hackathon planning estimates, not validated study-specific budgets or timelines.',
            'Public MPS I/II protocol structures can be adapted; participant-level data access, sponsor permission, consent and governance remain to be established.',
            'Clinical investigators will replace IDUA/IDS eligibility with validated SGSH/MPS IIIA diagnostic rules and review all listed eligibility deltas.',
            'MPS IIIA needs validated neurological and developmental endpoints; GAG biomarker overlap and somatic ERT precedent do not establish transferable efficacy endpoints.',
            'Approved Fayuvi exposure and investigational treatments will be captured and stratified so treated cohorts are not mistaken for untreated natural history.',
            'An available investigator team, engaged patient group and adequate funding can review a plan within weeks; recruitment and longitudinal follow-up still take longer.',
            'Maria is a composite family advocate, not a real patient; National MPS Society has not agreed to this proposal.',
        ]}}
