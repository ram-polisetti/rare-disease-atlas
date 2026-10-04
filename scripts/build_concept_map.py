#!/usr/bin/env python3
"""Build site/concepts.js: lay-language concept map derived from real phenotype nodes.
Run: python3 scripts/build_concept_map.py
Reads site/graph.json, writes site/concepts.js with:
  CONCEPT_PHENOS: concept_id -> [phenotype node ids]
  LAY_TO_CONCEPT: lay term -> concept_id  (~200 entries)
  PHRASE_RULES: [[regex_source, concept_id], ...]  (multi-word, tried first)
  CONCEPT_LABELS: concept_id -> short clinical label for the "We understood" trail
Do not invent concepts: every concept_id maps only to real phenotype node ids.
"""
import json, re, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
g = json.load(open(os.path.join(HERE, 'site', 'graph.json')))
phenos = [n for n in g['nodes'] if n.get('type') == 'phenotype']

def find_ids(*keywords):
    out = []
    for n in phenos:
        lab = n['label'].lower()
        if any(k in lab for k in keywords):
            out.append(n['id'])
    # de-dupe, cap at 12 per concept
    seen, res = set(), []
    for i in out:
        if i not in seen:
            seen.add(i); res.append(i)
    return res[:12]

# concept_id: (lay terms, phenotype keywords, trail label)
GROUPS = [
 ("speech-loss", ["speak","speaks","speaking","spoke","talk","talks","talking","talked","speech"],
  ["loss of speech","absent speech","aphasia","dysarthria","anarthria","slurred speech","speech articulation","abnormal speech"], "loss of speech"),
 ("speech-delay", ["late talking","slow to talk"],
  ["delayed speech and language development"], "delayed speech"),
 ("vision-loss", ["see","sees","seeing","saw","sight","vision","eyesight","blind","blindness"],
  ["blindness","blurred vision","visual impairment","night blindness","loss of vision","reduced visual acuity"], "vision loss"),
 ("hearing-loss", ["hear","hears","hearing","deaf","deafness"],
  ["hearing impairment","deafness","hearing loss"], "hearing loss"),
 ("gait", ["walk","walks","walking","walked","gait","steps","step"],
  ["gait disturbance","gait ataxia","shuffling gait","inability to walk","walking difficulty","abnormal gait"], "gait problems"),
 ("ataxia", ["balance","clumsy","uncoordinated","wobbly","falls","falling","stumbles"],
  ["ataxia","limb ataxia","sensory ataxia"], "ataxia / poor coordination"),
 ("seizure", ["seizure","seizures","convulsion","convulsions","fits","epilepsy","epileptic"],
  ["seizure"], "seizures"),
 ("swallow", ["swallow","swallowing","swallowed","eat","eating","eats","choke","choking","drool","drooling"],
  ["dysphagia","swallowing","sialorrhea","drooling"], "swallowing difficulty"),
 ("breathing", ["breathe","breathing","breathed","breath","breathless","wheeze","wheezing"],
  ["respiratory insufficiency","dyspnea","apnea","sleep apnea","respiratory distress"], "breathing difficulty"),
 ("growth", ["grow","growing","growth","short","small for age","not growing","tiny"],
  ["growth delay","short stature","failure to thrive","growth retardation"], "growth delay"),
 ("learning", ["learn","learning","school","reading","read","write","writing","slow learner"],
  ["intellectual disability","cognitive impairment","learning difficulty"], "learning difficulty"),
 ("dev-delay", ["delayed","late milestones","not sitting","not crawling","milestone"],
  ["developmental delay","global developmental delay","motor delay"], "developmental delay"),
 ("regression", ["regression","regressing","losing skills","lost skills","went backwards","decline","deteriorat"],
  ["developmental regression","neurodevelopmental regression","loss of developmental milestones"], "developmental regression"),
 ("macrocephaly", ["big head","large head","head too big"],
  ["macrocephaly","relative macrocephaly"], "large head"),
 ("microcephaly", ["small head","head too small"],
  ["microcephaly"], "small head"),
 ("hydrocephalus", ["water on the brain","fluid on the brain"],
  ["hydrocephalus"], "hydrocephalus"),
 ("liver", ["liver","belly swollen","swollen belly","big belly"],
  ["hepatomegaly"], "enlarged liver"),
 ("spleen", ["spleen"],
  ["splenomegaly"], "enlarged spleen"),
 ("heart", ["heart","cardiac"],
  ["cardiomyopathy","cardiac","left ventricular hypertrophy","valvular"], "heart problems"),
 ("bones", ["bones","bone"],
  ["dysostosis","skeletal dysplasia","bone dysplasia"], "bone abnormalities"),
 ("joints", ["joints","joint","stiff joints","contracture","stiffness"],
  ["joint contracture","joint stiffness","arthrogryposis"], "stiff joints"),
 ("skin", ["skin","rash","spots on skin"],
  ["angiokeratoma","skin rash","thick skin"], "skin changes"),
 ("eyes", ["cataract","cloudy eyes","cornea"],
  ["cataract","corneal clouding","corneal opacity"], "eye clouding / cataracts"),
 ("eye-move", ["cross-eyed","eyes wander","nystagmus"],
  ["nystagmus","strabismus","gaze palsy"], "abnormal eye movements"),
 ("hernia", ["hernia","bulge in groin"],
  ["hernia","inguinal hernia","umbilical hernia"], "hernia"),
 ("cough", ["cough","coughing","colds","sinus","runny nose"],
  ["cough","sinusitis","recurrent infections","respiratory tract infection"], "frequent coughs / infections"),
 ("fever", ["fever","fevers","temperature","febrile"],
  ["fever","recurrent fever","unexplained fever"], "fever"),
 ("pain", ["pain","painful","hurts","aches","ache"],
  ["pain","neuropathic pain","limb pain"], "pain"),
 ("muscle-weak", ["weak","weakness","floppy","low muscle tone","can't lift"],
  ["muscle weakness","hypotonia","generalized hypotonia"], "muscle weakness / floppiness"),
 ("muscle-stiff", ["stiff","spastic","tight muscles","rigid"],
  ["spasticity","hypertonia"], "muscle stiffness / spasticity"),
 ("behavior", ["behavior","behaviour","hyperactive","hyperactivity","tantrums","aggressive"],
  ["behavioral abnormality","hyperactivity","aggression"], "behavioral changes"),
 ("sleep", ["sleep","sleeping","sleeps","insomnia","night waking"],
  ["sleep disturbance","insomnia"], "sleep problems"),
 ("kidney", ["kidney","kidneys","renal"],
  ["renal","kidney"], "kidney problems"),
 ("face", ["coarse face","facial","funny looking","distinct face"],
  ["coarse facial","facial dysmorphism"], "coarse facial features"),
 ("teeth", ["teeth","tooth","dental","gums"],
  ["dental","gingival overgrowth","teeth abnormality"], "teeth / gum problems"),
 ("spine", ["spine","back curved","scoliosis"],
  ["scoliosis","kyphosis"], "curved spine"),
 ("hands", ["hands","clumsy hands","grip"],
  ["fine motor","hand"], "fine motor difficulty"),
 ("vomit", ["vomit","vomiting","throw up","nausea","nauseous"],
  ["vomiting","nausea"], "vomiting"),
 ("bowel", ["diarrhea","constipation","bowel"],
  ["diarrhea","constipation"], "bowel problems"),
 ("anemia", ["anemia","anemic","pale"],
  ["anemia"], "anemia"),
 ("bleed", ["bleed","bleeding","bruise","bruising","bruises"],
  ["bleeding","bruising","thrombocytopenia"], "bleeding / bruising"),
 ("startle", ["startle","startles","jumpy","exaggerated startle"],
  ["exaggerated startle response"], "exaggerated startle"),
]

lay_to_concept = {}
concept_phenos = {}
concept_labels = {}
for cid, lays, kws, label in GROUPS:
    ids = find_ids(*kws)
    if not ids:
        continue
    concept_phenos[cid] = ids
    concept_labels[cid] = label
    for lay in lays:
        lay_to_concept[lay.lower()] = cid

# Multi-word phrase rules: [pattern, concept_id] — tried BEFORE single words.
# "can't X / cannot X / unable to X" = loss of X (symptom PRESENT).
PHRASES = [
 (r"cant see|can not see|unable to see|loss of vision|going blind|vision loss", "vision-loss"),
 (r"cant hear|can not hear|unable to hear|loss of hearing|going deaf", "hearing-loss"),
 (r"cant speak|can not speak|unable to speak|loss of speech|stopped speaking|not speaking|doesnt speak|does not speak", "speech-loss"),
 (r"cant walk|can not walk|unable to walk|loss of walking|stopped walking|not walking", "gait"),
 (r"cant swallow|can not swallow|difficulty swallowing|trouble swallowing|choking on food", "swallow"),
 (r"cant breathe|can not breathe|difficulty breathing|trouble breathing|short of breath", "breathing"),
 (r"seizures?|convulsions?", "seizure"),
 (r"loss of (?:developmental )?milestones|losing skills|went backwards", "regression"),
 (r"frequent fevers|recurrent fever|unexplained fever", "fever"),
 (r"enlarged liver|big liver", "liver"),
 (r"enlarged spleen|big spleen", "spleen"),
 (r"stiff joints|joint contractures?", "joints"),
 (r"coarse (?:facial )?features", "face"),
]
# Negation markers: concept after these = symptom ABSENT (must not score).
# ("can't X" is handled by PHRASE_RULES as PRESENT = loss of X.)
ABSENT_RES = [
 r"\bno\s+",
 r"\bwithout\s+",
 r"\bdoesn'?t have\s+",
 r"\bdoes not have\s+",
 r"\bnever had\s+",
 r"\bdenies\s+",
]

def js_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

out = []
out.append("/* Lay-language concept map, generated from real phenotype nodes by")
out.append(" * scripts/build_concept_map.py. Do not hand-edit: regenerate.")
out.append(" * Every concept maps only to real phenotype node ids from site/graph.json. */")
out.append("var CONCEPT_PHENOS = {")
for cid, ids in sorted(concept_phenos.items()):
    out.append("  %s: [%s]," % (js_str(cid), ", ".join(js_str(i) for i in ids)))
out.append("};")
out.append("var CONCEPT_LABELS = {")
for cid, label in sorted(concept_labels.items()):
    out.append("  %s: %s," % (js_str(cid), js_str(label)))
out.append("};")
out.append("var LAY_TO_CONCEPT = {")
for lay, cid in sorted(lay_to_concept.items()):
    out.append("  %s: %s," % (js_str(lay), js_str(cid)))
out.append("};")
out.append("var PHRASE_RULES = [")
for pat, cid in PHRASES:
    if cid in concept_phenos:
        out.append("  [%s, %s]," % (js_str(pat), js_str(cid)))
out.append("];")
out.append("var ABSENT_RES = [")
for pat in ABSENT_RES:
    out.append("  %s," % js_str(pat))
out.append("];")

dest = os.path.join(HERE, 'site', 'concepts.js')
open(dest, 'w').write("\n".join(out) + "\n")
print("wrote", dest)
print("concepts:", len(concept_phenos), "| lay terms:", len(lay_to_concept), "| phrase rules:", len(PHRASES))
empty = [cid for cid, ids in concept_phenos.items() if not ids]
print("empty concepts:", empty)
