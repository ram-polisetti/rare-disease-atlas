/* Guide — the zero-knowledge front door.
 * Loads after views.js; uses its globals (GRAPH, nodesById, edgesOut, edgesIn,
 * synToId, el, esc, displayName, humanize, shortLabel, switchTab, fuzzySuggest).
 * Everything is computed client-side from graph.json. Nothing is invented:
 * orgs, trials, researchers, and timelines come from the graph or are labeled
 * as unknown / general process knowledge. Never diagnoses — matches are
 * presented as "closest in our data; only a clinician can diagnose."
 *
 * Build 2 (2026-10-03): redesigned as a short guided conversation —
 * welcome + role -> search -> confirmed-vs-possible match -> ONE recommended
 * action, with alternatives collapsed under an "Other paths" expander.
 * One question per screen, reassuring tone, no dead ends. Stressed-parent lens:
 * plain words, "what happens next" stated at every step. Medically serious,
 * never jokey. Bridge buttons (data-go-tab) go through Build 1's switchTab
 * gating, so research tools prompt before opening in parent mode.
 */

(function () {
'use strict';

var __fb = {
  el: function (id) { return document.getElementById(id); },
  esc: function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  displayName: function (n) { return (n && (n.label || n.id)) || ''; },
  humanize: function (s) {
    return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
};
function el(id) { return (typeof window.el === 'function' ? window.el(id) : __fb.el(id)); }
function esc(s) { return (typeof window.esc === 'function' ? window.esc(s) : __fb.esc(s)); }
function displayName(n) { return (typeof window.displayName === 'function' ? window.displayName(n) : __fb.displayName(n)); }
function humanize(s) { return (typeof window.humanize === 'function' ? window.humanize(s) : __fb.humanize(s)); }
function esc2(s) { return esc(String(s == null ? '' : s)); }

/* ---------------- data helpers ---------------- */

function outEdges(id, rel) {
  var idx = edgesOut[id] || [], out = [];
  for (var k = 0; k < idx.length; k++) {
    var e = GRAPH.edges[idx[k]];
    if (!rel || e.relation === rel) out.push(e);
  }
  return out;
}
function inEdges(id, rel) {
  var idx = edgesIn[id] || [], out = [];
  for (var k = 0; k < idx.length; k++) {
    var e = GRAPH.edges[idx[k]];
    if (!rel || e.relation === rel) out.push(e);
  }
  return out;
}
function diseaseNodes() {
  return GRAPH.nodes.filter(function (n) { return n.type === 'disease'; });
}
function orgsFor(did) {
  return outEdges(did, 'advocated_by').map(function (e) { return nodesById[e.target]; })
    .filter(function (n) { return n && n.type === 'patient_org'; });
}
function trialsFor(did) {
  return inEdges(did, 'studied_in').map(function (e) { return nodesById[e.source]; })
    .filter(function (n) { return n && n.type === 'trial'; });
}
function phenosFor(did) {
  return outEdges(did, 'has_phenotype').map(function (e) { return nodesById[e.target]; })
    .filter(function (n) { return n && n.type === 'phenotype'; });
}
/* Plain-language symptom names for parents. HPO labels are clinician jargon
 * ("Dysarthria", "Splenomegaly"); everywhere the guide addresses a parent —
 * candidate cards, checklists, "what families notice" — we show the plain
 * version. The original term stays in the data underneath. Keys are lowercase. */
var PLAIN_SYMPTOMS = {
  'seizure': 'Seizures',
  'seizures': 'Seizures',
  'bilateral tonic-clonic seizure': 'Convulsive seizures (whole body)',
  'generalized tonic-clonic seizures': 'Convulsive seizures (whole body)',
  'febrile seizures': 'Seizures with fever',
  'splenomegaly': 'Enlarged spleen',
  'hepatomegaly': 'Enlarged liver',
  'hepatosplenomegaly': 'Enlarged liver and spleen',
  'hypersplenism': 'Overactive spleen',
  'hearing impairment': 'Hearing loss',
  'sensorineural hearing impairment': 'Nerve-related hearing loss',
  'conductive hearing impairment': 'Hearing loss (sound not getting through)',
  'deafness': 'Deafness',
  'intellectual disability': 'Learning difficulties',
  'global developmental delay': 'Slow to reach milestones',
  'developmental regression': 'Losing skills they once had',
  'psychomotor retardation': 'Slow development of movement and thinking',
  'dysarthria': 'Slurred or unclear speech',
  'aphasia': 'Trouble understanding or producing speech',
  'dysphasia': 'Trouble finding words',
  'anarthria': 'Unable to speak clearly',
  'spasticity': 'Stiff, tight muscles',
  'hypertonia': 'Stiff muscles (high tone)',
  'hypotonia': 'Floppy muscles (low tone)',
  'muscle weakness': 'Weak muscles',
  'muscular hypotonia': 'Floppy muscles (low tone)',
  'atrophy': 'Wasting away',
  'muscle atrophy': 'Muscle wasting',
  'cerebellar atrophy': 'Shrinkage of the brain\u2019s balance center',
  'cerebral atrophy': 'Shrinkage of brain tissue',
  'coarse facial features': 'Distinctive facial features',
  'coarse facies': 'Distinctive facial features',
  'gait disturbance': 'Unsteady walking',
  'gait imbalance': 'Unsteady walking',
  'ataxia': 'Clumsy, unsteady movements',
  'dysphagia': 'Trouble swallowing',
  'feeding difficulties': 'Trouble feeding',
  'optic atrophy': 'Damage to the optic nerve (vision loss)',
  'visual impairment': 'Vision problems',
  'blindness': 'Vision loss',
  'night blindness': 'Trouble seeing in the dark',
  'nyctalopia': 'Trouble seeing in the dark',
  'cataract': 'Cloudy lens in the eye',
  'glaucoma': 'High pressure in the eye',
  'nystagmus': 'Involuntary eye movements',
  'strabismus': 'Crossed or misaligned eyes',
  'ptosis': 'Droopy eyelid',
  'corneal opacity': 'Cloudy surface of the eye',
  'cornea verticillata': 'Spiral pattern on the eye surface (seen in eye exams)',
  'recurrent respiratory infections': 'Frequent lung infections',
  'respiratory distress': 'Trouble breathing',
  'respiratory failure': 'Breathing failure',
  'dyspnea': 'Shortness of breath',
  'apnea': 'Pauses in breathing',
  'stridor': 'Noisy breathing',
  'wheezing': 'Wheezing',
  'short stature': 'Shorter height than expected',
  'growth delay': 'Slow growth',
  'failure to thrive': 'Not gaining weight or growing as expected',
  'obesity': 'Excess weight',
  'sleep disturbance': 'Sleep problems',
  'insomnia': 'Trouble sleeping',
  'progressive neurologic deterioration': 'Worsening brain and nerve function',
  'neurodegeneration': 'Gradual loss of brain function',
  'hyporeflexia': 'Weak reflexes',
  'hyperreflexia': 'Overactive reflexes',
  'areflexia': 'Absent reflexes',
  'joint stiffness': 'Stiff joints',
  'joint laxity': 'Unusually flexible joints',
  'flexion contracture': 'Joints stuck in a bent position',
  'scoliosis': 'Curved spine',
  'kyphosis': 'Hunched upper back',
  'lordosis': 'Deeply curved lower back',
  'dementia': 'Decline in memory and thinking',
  'memory impairment': 'Memory problems',
  'dystonia': 'Involuntary muscle twisting',
  'chorea': 'Involuntary jerky movements',
  'myoclonus': 'Sudden muscle jerks',
  'tremor': 'Shaking or trembling',
  'parkinsonism': 'Parkinson-like stiffness and slowness',
  'bradykinesia': 'Very slow movement',
  'rigidity': 'Muscle stiffness',
  'dysostosis multiplex': 'Bone changes seen on x-ray',
  'osteoporosis': 'Weak, brittle bones',
  'fractures': 'Bones that break easily',
  'hydrocephalus': 'Fluid buildup in the brain',
  'macrocephaly': 'Large head size',
  'microcephaly': 'Small head size',
  'depression': 'Depression',
  'anxiety': 'Anxiety',
  'frequent falls': 'Falling often',
  'clumsiness': 'Clumsiness',
  'mental deterioration': 'Decline in thinking and memory',
  'personality changes': 'Changes in personality',
  'behavioral abnormality': 'Unusual behavior',
  'aggressive behavior': 'Aggressive behavior',
  'hyperactivity': 'Hyperactivity',
  'autism': 'Autism traits',
  'anemia': 'Low red blood cells',
  'thrombocytopenia': 'Low platelets (bleeding risk)',
  'leukopenia': 'Low white blood cells',
  'neutropenia': 'Low infection-fighting blood cells',
  'pancytopenia': 'Low counts of all blood cells',
  'bleeding': 'Easy or excess bleeding',
  'epistaxis': 'Frequent nosebleeds',
  'motor delay': 'Slow to sit, crawl, or walk',
  'fine motor delay': 'Slow to develop hand skills',
  'cardiomegaly': 'Enlarged heart',
  'cardiomyopathy': 'Weakened heart muscle',
  'heart failure': 'Heart not pumping well',
  'arrhythmia': 'Irregular heartbeat',
  'mitral regurgitation': 'Leaky heart valve',
  'aortic stenosis': 'Narrowed main heart valve',
  'hypertension': 'High blood pressure',
  'hypotension': 'Low blood pressure',
  'orthostatic hypotension': 'Dizziness when standing up',
  'pes cavus': 'High arches in the feet',
  'pes planus': 'Flat feet',
  'sandal gap': 'Wide gap between first two toes',
  'urinary incontinence': 'Trouble controlling urination',
  'loss of speech': 'Loss of speech',
  'diarrhea': 'Diarrhea',
  'constipation': 'Constipation',
  'vomiting': 'Vomiting',
  'abdominal pain': 'Belly pain',
  'inguinal hernia': 'Groin hernia',
  'umbilical hernia': 'Belly-button hernia',
  'macroglossia': 'Large tongue',
  'micrognathia': 'Small jaw',
  'retrognathia': 'Jaw set back',
  'cleft palate': 'Opening in the roof of the mouth',
  'high palate': 'High roof of the mouth',
  'hirsutism': 'Excess body hair',
  'hypertrichosis': 'Excess hair growth',
  'alopecia': 'Hair loss',
  'angiokeratoma': 'Small dark red skin spots',
  'angiokeratoma corporis diffusum': 'Widespread dark red skin spots',
  'telangiectasia': 'Visible small blood vessels on skin',
  'hypohidrosis': 'Reduced sweating',
  'anhidrosis': 'Unable to sweat normally',
  'recurrent infections': 'Frequent infections',
  'immunodeficiency': 'Weak immune defenses',
  'lymphadenopathy': 'Swollen glands',
  'proteinuria': 'Protein in the urine (lab finding)',
  'hematuria': 'Blood in the urine',
  'glycosuria': 'Sugar in the urine (lab finding)',
  'renal insufficiency': 'Kidneys not working fully',
  'renal failure': 'Kidney failure',
  'nephrotic syndrome': 'Kidney filter problem (swelling, protein in urine)',
  'cryptorchidism': 'Undescended testicle',
  'hydrocele': 'Fluid swelling around the testicle',
  'tortuosity': 'Twisted blood vessels',
  'retinal tortuosity': 'Twisted blood vessels in the eye',
  'livedo reticularis': 'Mottled, net-like skin pattern',
  'acroparesthesia': 'Tingling or burning in hands and feet',
  'paresthesia': 'Tingling or numbness',
  'hypoesthesia': 'Reduced sense of touch',
  'hyperesthesia': 'Oversensitive skin',
  'allodynia': 'Pain from light touch',
  'neuropathic pain': 'Nerve pain (burning or shooting)',
  'pain': 'Pain',
  'abdominal distension': 'Swollen belly',
  'ascites': 'Fluid in the belly',
  'jaundice': 'Yellow skin and eyes',
  'icterus': 'Yellow skin and eyes',
  'edema': 'Swelling from fluid',
  'lymphedema': 'Swelling from fluid buildup',
  'pleural effusion': 'Fluid around the lungs',
  'pericardial effusion': 'Fluid around the heart',
  'exaggerated startle response': 'Strong startle reaction',
  'startle response': 'Startle reaction',
  'stereotypy': 'Repetitive movements',
  'hand wringing': 'Repetitive hand wringing',
  'bruxism': 'Teeth grinding',
  'drooling': 'Drooling',
  'sialorrhea': 'Excess drooling',
  'gastroesophageal reflux': 'Acid reflux',
  'pica': 'Eating non-food items',
  'anorexia': 'Loss of appetite',
  'cachexia': 'Severe weight and muscle loss',
  'fatigue': 'Extreme tiredness',
  'lethargy': 'Unusual sleepiness',
  'irritability': 'Irritability',
  'coma': 'Unresponsive (coma)',
  'syncope': 'Fainting',
  'vertigo': 'Spinning dizziness',
  'headache': 'Headaches',
  'migraine': 'Migraines',
  'photophobia': 'Sensitivity to light',
  'phonophobia': 'Sensitivity to sound',
  'anosmia': 'Loss of smell',
  'ageusia': 'Loss of taste',
  'diplopia': 'Double vision',
  'oscillopsia': 'Bouncing vision',
  'visual field defect': 'Blind spots in vision',
  'retinitis pigmentosa': 'Gradual vision loss starting at the edges',
  'macular degeneration': 'Loss of central vision',
  'cherry-red spot': 'Cherry-red spot on the retina (eye exam finding)',
  'hypopigmentation': 'Lighter patches of skin',
  'hyperpigmentation': 'Darker patches of skin',
  'cafe-au-lait spots': 'Light brown birthmark-like spots',
  'xanthoma': 'Yellowish fatty skin bumps',
  'short neck': 'Short neck',
  'webbed neck': 'Webbed neck (extra skin folds)',
  'low posterior hairline': 'Low hairline at the back of the neck',
  'pectus excavatum': 'Sunken chest',
  'pectus carinatum': 'Chest sticking out',
  'narrow chest': 'Narrow chest',
  'joint hypermobility': 'Very flexible joints',
  'dislocated hips': 'Hips out of joint',
  'hip dysplasia': 'Shallow hip sockets',
  'genu valgum': 'Knock knees',
  'genu varum': 'Bow legs',
  'clubfoot': 'Foot turned inward at birth',
  'overlapping toes': 'Overlapping toes',
  'broad thumb': 'Broad thumbs',
  'long fingers': 'Long, slender fingers',
  'arachnodactyly': 'Long, slender fingers',
  'brachydactyly': 'Short fingers or toes',
  'syndactyly': 'Fused fingers or toes',
  'polydactyly': 'Extra fingers or toes',
  'nail dysplasia': 'Abnormal nails',
  'thin skin': 'Thin skin',
  'thick skin': 'Thickened skin',
  'dry skin': 'Very dry skin',
  'ichthyosis': 'Scaly, dry skin',
  'eczema': 'Eczema (itchy rash)',
  'keratosis': 'Rough skin patches',
  'blistering': 'Skin blistering',
  'fragile skin': 'Skin that tears easily',
  'poor wound healing': 'Wounds heal slowly',
  'delayed dentition': 'Late teething',
  'dental crowding': 'Crowded teeth',
  'enamel defect': 'Weak tooth enamel',
  'gingival hypertrophy': 'Overgrown gums',
  'tongue fasciculations': 'Tongue twitching',
  'nasal speech': 'Nasal-sounding speech',
  'hoarse voice': 'Hoarse voice',
  'weak cry': 'Weak cry (in babies)',
  'stridor': 'Noisy breathing',
  'sleep apnea': 'Breathing pauses during sleep',
  'snoring': 'Loud snoring',
  'mouth breathing': 'Breathing through the mouth',
  'decreased fetal movement': 'Baby moved less than expected in pregnancy',
  'polyhydramnios': 'Too much fluid around the baby in pregnancy',
  'premature birth': 'Born early',
  'intrauterine growth retardation': 'Poor growth before birth',
  'macrosomia': 'Larger than expected at birth',
  'skeletal muscle atrophy': 'Muscle wasting',
  'incoordination': 'Poor coordination',
  'gait ataxia': 'Unsteady walking',
  'sensory axonal neuropathy': 'Nerve damage affecting feeling',
  'axonal neuropathy': 'Nerve damage',
  'peripheral neuropathy': 'Nerve damage in hands and feet',
  'axial hypotonia': 'Floppy trunk muscles (low tone)',
  'neurodevelopmental delay': 'Slow development',
  'cerebral cortical atrophy': 'Shrinkage of the brain\u2019s outer layer',
  'proximal muscle weakness': 'Weakness in shoulders and hips',
  'distal muscle weakness': 'Weakness in hands and feet',
  'impaired temperature sensation': 'Trouble feeling heat and cold',
  'impaired pain sensation': 'Reduced ability to feel pain',
  'reduced consciousness': 'Reduced awareness',
  'cognitive decline': 'Decline in thinking and memory',
  'cognitive impairment': 'Trouble with thinking and memory'
};
function plainSymptom(label) {
  var k = String(label || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (PLAIN_SYMPTOMS[k]) return PLAIN_SYMPTOMS[k];
  /* Fragment fallbacks: strip boilerplate HPO phrasing. */
  var s = k
    .replace(/^abnormality of (the )?/, '')
    .replace(/^abnormal /, '')
    .replace(/ morphology$/, '');
  if (PLAIN_SYMPTOMS[s]) return PLAIN_SYMPTOMS[s];
  return humanize(label);
}
/* Body-system grouping for the symptom checklist: parents recognize symptoms
 * faster when they are organized by body part. First matching group wins;
 * anything unmatched lands in "Other". Matching is on whole words of the
 * (humanized) label, so "heart" never misfires on "hearing". */
var PHENO_GROUPS = [
  { name: 'Brain, nerves, and development', words: ['brain','cerebral','cerebellar','cortex','cortical','hydrocephalus','nerve','nerves','neural','neuropathy','neuropathic','neuralgia','paresthesia','seizure','seizures','epilepsy','epileptic','ataxia','ataxic','hypotonia','hypertonia','spastic','spasticity','dystonia','dystonic','chorea','choreic','myoclonus','tremor','paralysis','paresis','plegia','hemiplegia','hemiparesis','parkinsonism','bradykinesia','rigidity','motor','gait','walking','coordination','postural','reflex','reflexes','areflexia','hyporeflexia','hyperreflexia','clonus','speech','language','dysarthria','aphasia','dysphasia','cognitive','intellectual','developmental','development','regression','behavior','behavioral','autism','autistic','hyperactivity','attention','memory','dementia','delusion','hallucination','hallucinations','psychosis','psychotic','depression','depressive','anxiety','anxious','apathy','agitation','personality','consciousness','lewy','micrographia','sleep','stroke','migraine','headache','vertigo','dizziness','syncope','coma','lethargy','irritability','encephalopathy','myelopathy','neurodegeneration','tic','tics','stereotypy','catatonia','mania','manic','neurologic','neurological','mental','psychomotor','emotional','lability','falls','clumsiness','clumsy','vegetative','startle','acroparesthesia','opisthotonus','ventriculomegaly','ischemic','fasciculations'] },
  { name: 'Eyes and vision', words: ['eye','eyes','visual','vision','retina','retinal','retinopathy','optic','macula','macular','cornea','corneal','lens','cataract','glaucoma','nystagmus','strabismus','myopia','hyperopia','astigmatism','blindness','blind','photophobia','squint','ptosis','coloboma','microphthalmia','anophthalmia','ocular','ophthalmic','iris','pupil','sclera','choroid','vitreous','fundus','diplopia','ophthalmoplegia','nyctalopia'] },
  { name: 'Ears and hearing', words: ['ear','ears','hearing','deafness','deaf','auditory','audition','otitis','otosclerosis','tinnitus','auricle','pinna','cochlear','vestibular'] },
  { name: 'Heart and circulation', words: ['heart','cardiac','cardio','cardiomyopathy','myocardial','aortic','aorta','valve','valvular','ventricular','ventricle','atrial','atrium','septal','arrhythmia','tachycardia','bradycardia','palpitation','hypertension','hypotension','pericardial','pericarditis','endocarditis','coarctation','stenosis','regurgitation','prolapse','cardiomegaly','circulation','circulatory','vascular','vasculitis','artery','arterial','vein','venous','edema','cyanosis'] },
  { name: 'Lungs and breathing', words: ['lung','lungs','pulmonary','respiratory','respiration','breathing','breath','apnea','apneic','dyspnea','tachypnea','bradypnea','pneumonia','bronchial','bronchitis','bronchiectasis','pleural','pneumothorax','cough','wheezing','wheeze','stridor','asthma','hypoxia','larynx','laryngeal','tracheal','trachea','pharynx','pharyngeal','voice','thorax','thoracic','chest','diaphragm','diaphragmatic'] },
  { name: 'Bones, joints, and muscles', words: ['bone','bones','skeletal','skeleton','joint','joints','articular','muscle','muscles','muscular','myopathy','myopathic','dystrophy','dystrophic','necrosis','scoliosis','kyphosis','lordosis','contracture','fracture','fractures','osteoporosis','osteopenia','arthritis','arthralgia','spine','spinal','vertebra','vertebral','rib','ribs','skull','cranial','cranium','limb','limbs','hand','hands','foot','feet','finger','fingers','toe','toes','arm','arms','leg','legs','femur','femoral','tibia','tibial','fibula','humerus','radius','ulna','pelvis','pelvic','patella','clavicle','scapula','sternum','sacrum','coccyx','carpal','tarsal','metacarpal','metatarsal','phalanx','epiphysis','diaphysis','metaphysis','dysplasia','dysplastic','hypoplasia','hyperplasia','aplasia','brachydactyly','syndactyly','polydactyly','clinodactyly','camptodactyly','tendon','ligament','bursa','myalgia','cramps','fasciculation','atrophy','hypertrophy','tone','dysostosis','pes','neck','thoracolumbar','stairs'] },
  { name: 'Skin, hair, and nails', words: ['skin','cutaneous','cutis','dermal','epidermal','hair','alopecia','hirsutism','hypertrichosis','hypotrichosis','nail','nails','angiokeratoma','angioma','telangiectasia','rash','eczema','dermatitis','pigmentation','hyperpigmentation','hypopigmentation','blister','blistering','ulcer','ulcers','ulceration','keratosis','ichthyosis','xerosis','sweat','sweating','anhidrosis','nevus','hemangioma','petechiae','purpura','ecchymosis','cellulitis','folliculitis','acne','warts','papilloma','xanthoma','lipoma'] },
  { name: 'Face, mouth, and head', words: ['face','facial','facies','forehead','frontal','nose','nasal','nostril','mouth','oral','lip','lips','palate','palatal','cleft','tooth','teeth','dental','dentition','microdontia','macrodontia','hypodontia','oligodontia','jaw','mandible','mandibular','maxilla','maxillary','chin','cheek','cheeks','tongue','lingual','gum','gingival','head','cephaly','dolichocephaly','turricephaly','oxycephaly','microcephaly','macrocephaly','plagiocephaly','brachycephaly','scaphocephaly','trigonocephaly','craniosynostosis','suture','fontanelle','hypertelorism','hypotelorism','epicanthus','glabella','philtrum','columella','alae','hairline','tonsil','tonsils','sinus','sinusitis','rhinitis','adenoid','vermilion','macroglossia','synophrys','nares'] },
  { name: 'Tummy, liver, and digestion', words: ['abdominal','abdomen','belly','stomach','gastric','intestinal','intestine','bowel','bowels','colonic','colon','rectal','rectum','duodenal','jejunal','ileal','diarrhea','constipation','vomiting','nausea','feeding','dysphagia','reflux','gerd','hernia','hernias','liver','hepatic','hepatomegaly','hepatitis','spleen','splenic','splenomegaly','pancreas','pancreatic','pancreatitis','gallbladder','biliary','cholelithiasis','appendix','peritoneal','ascites','flatulence','bloating','colic','dysentery','malabsorption','steatorrhea','icterus','jaundice','hepatosplenomegaly','hypersplenism','cholecystitis'] },
  { name: 'Kidneys, bladder, and urinary tract', words: ['kidney','kidneys','renal','nephro','nephritis','nephrosis','nephrotic','bladder','urinary','urine','ureter','urethra','urethral','proteinuria','hematuria','glycosuria','polyuria','oliguria','anuria','nocturia','enuresis','incontinence','dysuria','hydronephrosis','cystitis','pyelonephritis','genital','genitalia','cryptorchidism','hypospadias','epispadias','phimosis','micropenis','nephrocalcinosis','dialysis'] },
  { name: 'Blood and immune system', words: ['blood','anemia','anemic','thrombocytopenia','leukopenia','leukocytosis','neutropenia','neutrophilia','lymphopenia','pancytopenia','bleeding','bleed','bruising','bruise','hemorrhage','hemorrhagic','coagulation','platelet','platelets','hemoglobin','erythrocyte','leukocyte','lymphocyte','neutrophil','immune','immunity','immunodeficiency','infection','infections','infectious','sepsis','lymph','lymphadenopathy','lymphoma','thymus','complement','antibody','autoimmune','splenectomy','histiocytosis'] },
  { name: 'Growth and weight', words: ['growth','stature','height','weight','obesity','obese','overweight','underweight','cachexia','wasting','thrive','failure','puberty','precocious','delayed'] },
  { name: 'Lab and test results', words: ['circulating','concentration','level','levels','activity','elevated','decreased','increased','reduced','elevation','reduction','abnormal','finding','marker','enzyme','creatine','kinase','cholesterol','triglyceride','glucose','protein','albumin','bilirubin','creatinine','urea','electrolyte','calcium','phosphate','magnesium','potassium','sodium','acidosis','alkalosis','lactic','ammonia','amino','organic','lysosomal','metabolism','homeostasis','metabolic'] },
  { name: 'Other', words: [] }
];
PHENO_GROUPS.forEach(function (gr) {
  gr._set = {};
  gr.words.forEach(function (w) { gr._set[w] = 1; });
});
var KIDNEY_GI = -1;
var LAB_GI = -1;
PHENO_GROUPS.forEach(function (gr, gi) {
  if (gr.name.indexOf('Kidneys') === 0) KIDNEY_GI = gi;
  if (gr.name.indexOf('Lab and test') === 0) LAB_GI = gi;
});
function phenoGroupIndex(p) {
  var toks = ((p.label || '').toLowerCase().match(/[a-z]+/g)) || [];
  for (var gi = 0; gi < PHENO_GROUPS.length - 1; gi++) {
    var set = PHENO_GROUPS[gi]._set;
    for (var t = 0; t < toks.length; t++) {
      if (set[toks[t]]) return gi;
      /* -uria words (proteinuria, glycosuria, mucopolysacchariduria, …)
       * are urine/kidney findings even when not listed by name. */
      if (KIDNEY_GI !== -1 && /uria$/.test(toks[t]) && toks[t].length > 4) return KIDNEY_GI;
    }
  }
  return PHENO_GROUPS.length - 1;
}
/* Most-shared phenotypes first: symptoms recorded for the most diseases tend
 * to be the classic, recognizable ones — better for a quick "does this sound
 * like your situation" check than raw data order. Cached per phenotype. */
var PHENO_DEG = {};
function phenoDegree(p) {
  var key = p.id || p.label;
  if (!(key in PHENO_DEG)) PHENO_DEG[key] = p.id ? inEdges(p.id, 'has_phenotype').length : 0;
  return PHENO_DEG[key];
}
/* Observable symptoms only for the quick check: a parent can't "recognize"
 * an inheritance pattern, an onset label, or a lab value. */
function isObservablePheno(p) {
  if (phenoGroupIndex(p) === LAB_GI) return false;
  var lbl = String(p.label || '').toLowerCase();
  return lbl.indexOf('inheritance') === -1 && !/ onset$/.test(lbl);
}
function allConfirmPhenos() {
  var d = nodesById[G.diseaseId];
  if (!d) return [];
  var all = phenosFor(d.id);
  var obs = all.filter(isObservablePheno);
  var pool = obs.length ? obs : all;
  /* Already picked on the previous screen: counted, not asked again. */
  var picked = {};
  (G.confirmedPhenos || []).forEach(function (k) { picked[String(k).toLowerCase()] = 1; });
  pool = pool.filter(function (p) { return !picked[String(p.id || p.label).toLowerCase()]; });
  return pool.slice().sort(function (a, b) { return phenoDegree(b) - phenoDegree(a); });
}
/* Symptoms the parent already picked on the ambiguous screen carry forward
 * into the confirmation, so nothing gets ticked twice. */
function seedConfirmedFromFilter(did) {
  var f = G.ambFilter || {}, out = [];
  phenosFor(did).forEach(function (p) {
    var key = p.id || p.label;
    if (f[String(key).toLowerCase()] && out.indexOf(key) === -1) out.push(key);
  });
  return out;
}
function phenoLabel(key) {
  var n = nodesById[key];
  if (n && n.label) return n.label;
  return String(key || '');
}
function confirmPhenos() {
  var all = allConfirmPhenos();
  return G.phenoExpanded ? all : all.slice(0, 4);
}
function genesFor(did) {
  var gs = outEdges(did, 'associated_with_gene').concat(outEdges(did, 'caused_by_variant_in'));
  var seen = {}, out = [];
  gs.forEach(function (e) {
    var n = nodesById[e.target];
    if (n && n.type === 'gene' && !seen[n.id]) { seen[n.id] = 1; out.push(n); }
  });
  return out;
}
function mechsFor(did) {
  return outEdges(did, 'has_mechanism').map(function (e) { return nodesById[e.target]; })
    .filter(function (n) { return n && n.type === 'mechanism'; });
}
function relatedFor(did) {
  var seen = {}, out = [];
  outEdges(did, 'shares_pathway').forEach(function (e) {
    var n = nodesById[e.target];
    if (n && n.type === 'disease' && n.id !== did && !seen[n.id]) { seen[n.id] = 1; out.push({ node: n, edge: e }); }
  });
  return out;
}
function researchersFor(did) {
  var seen = {}, out = [];
  function add(n) { if (n && n.type === 'researcher' && !seen[n.id]) { seen[n.id] = 1; out.push(n); } }
  genesFor(did).forEach(function (g) {
    inEdges(g.id, 'investigates').forEach(function (e) { add(nodesById[e.source]); });
  });
  inEdges(did, 'investigates').forEach(function (e) { add(nodesById[e.source]); });
  inEdges(did, 'authored_study_on').forEach(function (e) { add(nodesById[e.source]); });
  return out;
}
function recruitingTrials(did) {
  return trialsFor(did).filter(function (t) {
    var s = ((t.extra && t.extra.status) || '').toUpperCase();
    return s.indexOf('RECRUIT') === 0;
  });
}
function alsoCalled(d) {
  var syns = (d.synonyms || []).filter(function (s) { return s.toLowerCase() !== d.label.toLowerCase(); });
  return syns.slice(0, 3).join('; ');
}
/* Dossier helpers (Build A — full printable dossier). Additive; never invent. */
function assetsFor(did) {
  var seen = {}, out = [];
  function add(e, other) {
    var n = nodesById[other];
    if (n && n.type === 'asset' && !seen[n.id]) { seen[n.id] = 1; out.push(n); }
  }
  outEdges(did).forEach(function (e) { add(e, e.target); });
  inEdges(did).forEach(function (e) { add(e, e.source); });
  return out;
}
function quotesFor(did, n) {
  var seen = {}, out = [];
  function add(e) {
    if (seen[e.source + '|' + e.target] || !e.source_quote) return;
    seen[e.source + '|' + e.target] = 1;
    out.push(e);
  }
  outEdges(did).forEach(add);
  inEdges(did).forEach(add);
  out.sort(function (a, b) {
    var ao = a.evidence === 'observed' ? 0 : 1, bo = b.evidence === 'observed' ? 0 : 1;
    return ao - bo;
  });
  return out.slice(0, n || 3);
}
function nextStepFor(did) {
  var orgs = orgsFor(did);
  var rec = recruitingTrials(did).length;
  if (orgs.length) return 'Call or message <strong>' + esc2(orgs[0].label) + '</strong> &mdash; they talk to families like yours every day.';
  if (rec) return 'Look at the studies below and ask your doctor whether any could be a fit.';
  return 'Ask your doctor for a referral to a genetic counselor who knows this condition.';
}
function endpointsForDossier(did) {
  if (typeof epFamilyOf !== 'function' || typeof epCompute !== 'function') return null;
  var fid = epFamilyOf(did);
  if (!fid) return [];
  return epCompute().filter(function (r) { return r.fams.indexOf(fid) !== -1; });
}
function therapyBannerHTML(d) {
  var ts = d.extra && d.extra.therapy_status;
  if (!ts || !ts.note) return '';
  return '<div class="guide-nextstep"><strong>Latest treatment news:</strong> ' + esc2(ts.note) + '</div>';
}

/* ---------------- interpretation (unchanged logic) ---------------- */

var STOP = {};
('a,an,the,my,son,daughter,child,kid,was,were,is,are,with,has,have,had,he,she,they,them,his,her,our,of,to,in,on,at,for,and,or,just,been,got,getting,about,what,when,why,how,do,does,did,can,could,would,should,i,you,we,it,this,that,these,those,from,by,as,not,no,yes,me,him,us,very,more,most,now,today,old,age,doctor,said,says,diagnosed,diagnosis,disease,syndrome,condition,ill,sick,problem,problems,help,please,find,know,think,might,maybe,couldnt,cant,wont,dont').split(',').forEach(function (w) { STOP[w] = 1; });

function interpret(q) {
  var low = q.trim().toLowerCase();
  if (low.length < 2) return { kind: 'nomatch' };

  // 1. disease: substring match on labels + synonyms
  var hits = diseaseNodes().filter(function (d) {
    var names = [d.label].concat(d.synonyms || []).map(function (s) { return s.toLowerCase(); });
    return names.some(function (n) { return n.indexOf(low) !== -1 || (low.length > 4 && low.indexOf(n) !== -1); });
  });
  // 1b. natural sentence ("my son was diagnosed with sanfilippo"): strip filler
  // words and retry the substring match, so a parent typing normally still
  // finds the disease name instead of hitting a dead end.
  var stripped = low.split(/[^a-z0-9]+/).filter(function (t) { return t && !STOP[t]; }).join(' ');
  if (!hits.length && stripped && stripped !== low) {
    hits = diseaseNodes().filter(function (d) {
      var names = [d.label].concat(d.synonyms || []).map(function (s) { return s.toLowerCase(); });
      return names.some(function (n) { return n.indexOf(stripped) !== -1 || (stripped.length > 4 && stripped.indexOf(n) !== -1); });
    });
  }
  // 2. fuzzy (typo-tolerant); also tried on the stripped query so a misspelled
  // name inside a sentence ("my son has sanfilipo") still matches.
  if (!hits.length && typeof fuzzySuggest === 'function') {
    var fz = fuzzySuggest(low) || (stripped && stripped !== low ? fuzzySuggest(stripped) : null);
    if (fz && nodesById[fz.id] && nodesById[fz.id].type === 'disease') hits = [nodesById[fz.id]];
  }
  // 3. gene symbol -> its diseases
  if (!hits.length) {
    var gene = GRAPH.nodes.filter(function (n) { return n.type === 'gene'; }).filter(function (g) {
      var names = [g.label].concat(g.synonyms || []).map(function (s) { return s.toLowerCase(); });
      return names.indexOf(low) !== -1 ||
        names.some(function (n) { return n.indexOf(low) === 0 || low.indexOf(n) === 0; });
    })[0];
    if (gene) {
      var ds = {};
      inEdges(gene.id, 'associated_with_gene').concat(inEdges(gene.id, 'caused_by_variant_in'))
        .forEach(function (e) { if (nodesById[e.source] && nodesById[e.source].type === 'disease') ds[e.source] = 1; });
      hits = Object.keys(ds).map(function (id) { return nodesById[id]; });
    }
  }
  if (hits.length === 1) return { kind: 'disease', id: hits[0].id };
  if (hits.length > 1) return { kind: 'ambiguous', candidates: hits.slice(0, 6), via: 'name' };

  // 4. symptom -> phenotype token match -> candidate diseases
  var toks = low.split(/[^a-z0-9]+/).filter(function (t) { return t.length > 2 && !STOP[t]; });
  if (toks.length) {
    var scores = {};
    GRAPH.nodes.forEach(function (n) {
      if (n.type !== 'phenotype') return;
      var words = ([n.label].concat(n.synonyms || [])).join(' ').toLowerCase().split(/[^a-z0-9]+/);
      var m = 0;
      toks.forEach(function (t) {
        for (var i = 0; i < words.length; i++) {
          var w = words[i];
          if (w === t || (w.length > 4 && t.length > 3 && (w.indexOf(t) === 0 || t.indexOf(w) === 0))) { m++; break; }
        }
      });
      if (m > 0) inEdges(n.id, 'has_phenotype').forEach(function (e) { scores[e.source] = (scores[e.source] || 0) + m; });
    });
    var ranked = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; })
      .slice(0, 4).map(function (id) { return nodesById[id]; })
      .filter(function (n) { return n && n.type === 'disease'; });
    if (ranked.length) return { kind: 'ambiguous', candidates: ranked, via: 'symptoms' };
  }
  return { kind: 'nomatch' };
}

/* ---------------- roles (folded-in Start; lightweight, remembered) ---------------- */

var ROLE_KEY = 'rda_role';
var ROLES = {
  care: { label: "I'm caring for someone", short: 'caring for someone', blurb: 'For a child or family member' },
  patient: { label: 'I have this condition', short: 'living with this condition', blurb: 'For yourself' },
  org: { label: 'I lead a patient organization', short: 'leading a patient organization', blurb: 'Building community, funding, or advocacy' },
  scout: { label: "I'm scouting therapies", short: 'scouting therapies', blurb: 'Looking for treatments or trials to support' },
  researcher: { label: "I'm a researcher", short: 'doing research', blurb: 'Studying diseases, genes, or mechanisms' }
};
function getRole() {
  try { var r = localStorage.getItem(ROLE_KEY); return ROLES[r] ? r : null; } catch (e) { return null; }
}
function setRole(r) {
  if (!ROLES[r]) r = null;
  try { localStorage.setItem(ROLE_KEY, r || ''); } catch (e) {}
  G.role = r;
  /* The guide's role question personalizes wording. Tab visibility is no
   * longer gated by role — every tab is visible to everyone. */
  try {
    localStorage.setItem('rda_mode_asked', '1');
  } catch (e) {}
}
function roleShort() { return G.role ? ROLES[G.role].short : null; }

/* ---------------- guide state + rendering ---------------- */

var G = { screen: 'landing', diseaseId: null, candidates: [], via: null, query: '', role: getRole(), certain: null, confirmedPhenos: [] };

function isNight() {
  var h = new Date().getHours();
  return h >= 23 || h < 6;
}

function go(screen) {
  G.screen = screen;
  renderGuide();
  var body = el('guideBody');
  if (body) {
    body.scrollTop = 0;
    var h = body.querySelector('h2.guide-h');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  window.scrollTo(0, 0);
}

/* Small orientation line: one question at a time, "what happens next" always stated. */
function stepLine(n) {
  var nexts = { 1: 'Then we&rsquo;ll ask what you know.', 2: 'Then we&rsquo;ll check what matches.', 3: 'Then you get one clear next step.', 4: '' };
  return '<p class="guide-step">Step ' + n + ' of 4' + (nexts[n] ? ' &middot; ' + nexts[n] : '') + '</p>';
}
function roleLine() {
  var rs = roleShort();
  return '<p class="guide-roleline">' +
    (rs ? 'You&rsquo;re here as: <strong>' + esc2(rs) + '</strong> &middot; '
        : 'No role picked yet &middot; ') +
    '<button type="button" class="guide-link" data-nav="landing">change</button></p>';
}

/* Bridge buttons to other tabs. These call Build 1's switchTab, which gates
 * research tools (Explore, What If, ...) with the researcher-mode prompt in
 * parent mode — never a silent landing on a hidden tab. */
function bridgeHTML() {
  return '<div class="guide-bridge">' +
    '<p>Want the full picture? The complete atlas is behind this guide:</p>' +
    '<div class="guide-bridge-btns">' +
    '<button type="button" class="btn" data-go-tab="explore">Explore the graph</button>' +
    '<button type="button" class="btn" data-go-tab="journey">Family Journey</button>' +
    '<button type="button" class="btn" data-go-tab="whatif">What-if planner</button>' +
    '<button type="button" class="btn" data-go-tab="action">Your Disease page</button>' +
    '</div></div>';
}

function wireBridge(scope) {
  (scope || document).querySelectorAll('[data-go-tab]').forEach(function (b) {
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      var t = b.getAttribute('data-go-tab');
      if (t && typeof switchTab === 'function') switchTab(t);
    });
  });
}
/* Disease names for zero-knowledge readers: prefer familiar common names
 * (Sanfilippo, Hunter, Fabry...), then names containing disease-words, then
 * the curated label. Never surfaces drug names (e.g. "Aglucosidase alfa")
 * as if they were the disease. */
var COMMON_NAMES = /sanfilippo|hunter|fabry|gaucher|pompe|krabbe|tay[\s-]?sachs|niemann|sandhoff|metachromatic|hurler|scheie/i;
var DISEASE_WORDS = /disease|syndrome|deficiency|disorder|dystrophy|lipidosis|gangliosidosis|leukodystrophy/i;
var DRUG_PAT = /(alfa|beta|gamma|mab|nib|tinib|pase|zyme|plasm)\b/i;
function guideName(n) {
  if (!n) return '';
  if (n.type !== 'disease') return displayName(n);
  var cands = [n.label].concat(n.synonyms || []).filter(function (s) {
    return s && s.length <= 60 && !DRUG_PAT.test(s);
  });
  var i, common = null, dw = null;
  for (i = 0; i < cands.length; i++) {
    if (COMMON_NAMES.test(cands[i]) && !common) common = cands[i];
    if (DISEASE_WORDS.test(cands[i]) && !dw) dw = cands[i];
    if (common && dw) break;
  }
  var pick = common || dw || n.label;
  // Tidy leading lowercase from MONDO labels ("mucopolysaccharidosis type 3A").
  return pick.charAt(0).toUpperCase() + pick.slice(1);
}

function safeUrl(u) {
  u = String(u || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  return 'https://clinicaltrials.gov/';
}

function renderGuide() {
  var body = el('guideBody');
  if (!body) return;
  // Screens below need a disease; without one, restart at search.
  var needsDisease = { confirm: 1, action: 1, families: 1, understand: 1, research: 1, connections: 1, export: 1 };
  if (needsDisease[G.screen] && !nodesById[G.diseaseId]) G.screen = 'search';
  if (G.screen === 'ambiguous' && (!G.candidates || !G.candidates.length)) G.screen = 'search';
  var h = '';
  if (G.screen === 'landing') h = vLanding();
  else if (G.screen === 'search') h = vSearch();
  else if (G.screen === 'confirm') h = vConfirm();
  else if (G.screen === 'ambiguous') h = vAmbiguous();
  else if (G.screen === 'nomatch') h = vNoMatch();
  else if (G.screen === 'action') h = vAction();
  else if (G.screen === 'families') h = vFamilies();
  else if (G.screen === 'understand') h = vUnderstand();
  else if (G.screen === 'research') h = vResearch();
  else if (G.screen === 'connections') h = vConnections();
  else if (G.screen === 'export') h = vExport();
  body.innerHTML = h;
  wireGuide(body);
  wireBridge(body);
  // Tier-1 tap-for-definition across the guide conversation (additive).
  if (typeof markTerms === 'function') markTerms(body);
}

/* ---- Step 1 of 4: welcome + role selector ---- */

function vLanding() {
  var night = isNight();
  var roles = Object.keys(ROLES).map(function (k) {
    var sel = G.role === k;
    return '<button type="button" class="guide-role" role="radio" aria-checked="' + (sel ? 'true' : 'false') + '" data-role="' + k + '">' +
      '<strong>' + esc2(ROLES[k].label) + '</strong><span>' + esc2(ROLES[k].blurb) + '</span></button>';
  }).join('');
  return '<div class="guide-hero">' +
    (night ? '<div class="guide-night">It&rsquo;s late. You don&rsquo;t have to figure everything out tonight. ' +
      'We&rsquo;ll take this one question at a time and end with one clear next step.</div>' : '') +
    '<h2 class="guide-h">You&rsquo;re not alone. Let&rsquo;s find your path together.</h2>' +
    '<p class="guide-sub">This guide asks one question at a time and ends with <strong>one clear next step</strong>. ' +
    'You&rsquo;re doing the right thing by looking. Plain words are fine.</p>' +
    stepLine(1) +
    '<p class="guide-sub"><strong>First, who are you here as?</strong></p>' +
    '<div class="guide-roles" role="radiogroup" aria-label="Who are you here as">' + roles + '</div>' +
    '<p class="guide-fine">We&rsquo;ll remember your choice. You can change it anytime.</p>' +
    '<p class="guide-alt"><button type="button" class="guide-link" data-nav="search">Skip &mdash; just let me search</button></p>' +
    '</div>';
}

/* ---- Step 2 of 4: disease-or-symptom search ---- */

function vSearch() {
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="landing">&larr; Who I&rsquo;m here as</button>' +
    '<h2 class="guide-h">Tell us what you know.</h2>' +
    stepLine(2) +
    roleLine() +
    '<p class="guide-sub">A diagnosis name, a gene, or symptoms in plain words. One thing at a time is fine.</p>' +
    '<div class="guide-searchrow">' +
    '<input id="guideQ" type="text" autocomplete="off" spellcheck="false" aria-label="Describe your situation" placeholder="What brings you here tonight?">' +
    '<button id="guideGo" class="btn primary">Find my community &rarr;</button>' +
    '</div>' +
    '<div class="guide-examples"><span>Try:</span>' +
    '<button type="button" class="chip" data-ex="My son was diagnosed with Sanfilippo">My son was diagnosed with Sanfilippo</button>' +
    '<button type="button" class="chip" data-ex="The doctor said something about MPS III">The doctor said something about MPS III</button>' +
    '<button type="button" class="chip" data-ex="He can\'t walk anymore and they don\'t know why">He can&rsquo;t walk anymore and they don&rsquo;t know why</button>' +
    '</div>' +
    '<p class="guide-fine">We&rsquo;ll never guess a diagnosis. We only show what&rsquo;s actually in our data &mdash; and we say so when we don&rsquo;t have it.</p>' +
    '</div>';
}

/* ---- Step 3 of 4: confirmed vs possible match ---- */

function phenoCheckHTML(p, flatIndex) {
  var chk = (G.confirmedPhenos || []).indexOf(p.id || p.label) !== -1 ? ' checked' : '';
  return '<label class="guide-check"><input type="checkbox" data-ph="' + flatIndex + '"' + chk + '> ' + esc2(plainSymptom(p.label)) + '</label>';
}

function alreadyPickedHTML() {
  var picked = (G.confirmedPhenos || []).map(function (k) { return plainSymptom(phenoLabel(k)); }).filter(Boolean);
  if (!picked.length) return '';
  return '<p class="guide-sub">You already picked these on the last screen, so they&rsquo;re counted &mdash; no need to tick them again: <strong>' +
    esc2(picked.join('; ')) + '</strong>.</p>';
}

function vConfirm() {
  var d = nodesById[G.diseaseId];
  if (!d) return vSearch();
  var flat = confirmPhenos(); /* sorted by recognizability; top 4 unless expanded */
  var total = allConfirmPhenos().length;
  var ak = alsoCalled(d);
  var checks;
  if (!G.phenoExpanded) {
    checks = flat.map(function (p, i) { return phenoCheckHTML(p, i); }).join('');
  } else {
    /* Expanded: every recorded symptom, organized by body part so a parent
     * can scan for what they recognize. data-ph keeps the flat index so the
     * change handler stays correct. */
    var buckets = PHENO_GROUPS.map(function () { return []; });
    flat.forEach(function (p, i) { buckets[phenoGroupIndex(p)].push({ p: p, i: i }); });
    checks = buckets.map(function (b, gi) {
      if (!b.length) return '';
      return '<h4 class="guide-phgroup">' + esc2(PHENO_GROUPS[gi].name) +
        ' <span class="guide-phcount">(' + b.length + ')</span></h4>' +
        b.map(function (e) { return phenoCheckHTML(e.p, e.i); }).join('');
    }).join('');
  }
  var moreBtn = (!G.phenoExpanded && total > 4)
    ? '<button type="button" class="btn ghost" id="phenoMore">Show all ' + total + ' recorded symptoms, grouped by body part</button>' : '';
  var backTarget = (G.candidates && G.candidates.length > 1) ? 'ambiguous' : 'search';
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="' + backTarget + '">&larr; Back</button>' +
    '<h2 class="guide-h">It sounds like you&rsquo;re asking about <span class="hl">' + esc2(guideName(d)) + '</span>.</h2>' +
    stepLine(3) +
    roleLine() +
    (ak ? '<p class="guide-sub">Also called: ' + esc2(ak) + '</p>' : '') +
    '<div class="guide-ground">' +
    '<p><strong>You are not alone.</strong> This is a rare genetic condition. There is active research and a community of families on the same path.</p>' +
    '<p class="guide-fine">Only a clinician can make a diagnosis. What follows is what our data says about this condition &mdash; not medical advice.</p>' +
    '</div>' +
    '<h3 class="guide-h3">Quick check &mdash; does this sound like your situation?</h3>' +
    alreadyPickedHTML() +
    '<p class="guide-sub">Tick any others you recognize. This helps us point you right.</p>' +
    '<div class="guide-checks">' + (checks || '<p class="guide-fine">We don&rsquo;t have symptom details recorded for this condition yet.</p>') + '</div>' +
    (moreBtn ? '<div class="guide-btnrow">' + moreBtn + '</div>' : '') +
    '<div class="guide-btnrow">' +
    '<button type="button" class="btn primary" data-certain="yes">Yes, this is our diagnosis &rarr;</button>' +
    '<button type="button" class="btn" data-certain="maybe">I think so, but I&rsquo;m not sure</button>' +
    '</div>' +
    '<p class="guide-fine"><button type="button" class="guide-linklike" data-skip-check>Skip this check &mdash; take me straight to the next step &rarr;</button></p>' +
    '<p class="guide-fine">Not sure? That&rsquo;s okay &mdash; keep going and we&rsquo;ll keep things general, ' +
    'or talk to a <a href="https://www.acmg.net/" target="_blank" rel="noopener">genetic counselor</a> who can help clarify.</p>' +
    '</div>';
}

/* ---- Ambiguous: candidate cards + side-by-side comparison (kept from Build B) ---- */

/* Symptom comparison (Build B): side-by-side view of candidate matches.
 * Shared symptoms (why they're confused), differentiating symptoms per disease,
 * and a "what makes this one different" line. Never diagnoses. */
function compareHTML(cands) {
  var phenosBy = cands.map(function (d) {
    var seen = {}, out = [];
    phenosFor(d.id).forEach(function (p) {
      if (phenoGroupIndex(p) === LAB_GI) return;
      var k = (p.label || '').toLowerCase();
      /* Inheritance and onset timing aren't observable symptoms. */
      if (k.indexOf('inheritance') !== -1 || / onset$/.test(k)) return;
      if (k && !seen[k]) { seen[k] = 1; out.push({ key: k, label: plainSymptom(p.label) }); }
    });
    return out;
  });
  var counts = {};
  phenosBy.forEach(function (ps) { ps.forEach(function (p) { counts[p.key] = (counts[p.key] || 0) + 1; }); });
  var shared = [];
  Object.keys(counts).forEach(function (k) {
    if (counts[k] > 1) {
      var lbl = null;
      phenosBy.forEach(function (ps) { ps.forEach(function (p) { if (p.key === k && !lbl) lbl = p.label; }); });
      if (lbl) shared.push(lbl);
    }
  });
  var cards = cands.map(function (d, i) {
    var unique = phenosBy[i].filter(function (p) { return counts[p.key] === 1; }).slice(0, 4);
    var genes = genesFor(d.id);
    var diffLine = unique.length
      ? 'In our data, ' + unique.slice(0, 2).map(function (p) { return p.label.toLowerCase(); }).join(' and ') + ' point more toward this one.'
      : (genes.length ? 'Linked to the ' + genes[0].label + ' gene — a genetic test can tell these apart.'
        : 'Our data doesn&rsquo;t record a clear differentiator yet — a geneticist can.');
    return '<div class="guide-compare-card">' +
      '<strong>' + esc2(guideName(d)) + '</strong>' +
      (unique.length ? '<span class="guide-compare-diff">Only this one, in our data: ' + esc2(unique.map(function (p) { return p.label; }).join('; ')) + '</span>'
        : '<span class="guide-compare-diff">No unique symptoms recorded in our data.</span>') +
      '<span class="guide-compare-why">' + diffLine + '</span>' +
      '<button type="button" class="btn small" data-pick="' + d.id + '">Open ' + esc2(guideName(d)) + ' &rarr;</button>' +
      '</div>';
  }).join('');
  return '<div class="guide-compare">' +
    '<h3 class="guide-h3">See them side by side</h3>' +
    '<p class="guide-sub">You&rsquo;re doing the right thing by looking closely. These conditions can look alike &mdash; here&rsquo;s how our data tells them apart. Only a clinician can diagnose.</p>' +
    (shared.length ? '<div class="guide-compare-shared"><strong>Symptoms they share</strong> (why they can be confused): ' + esc2(shared.slice(0, 8).join('; ')) + '</div>'
      : '<div class="guide-compare-shared">Our data doesn&rsquo;t record overlapping symptoms for these.</div>') +
    '<div class="guide-compare-cards">' + cards + '</div>' +
    '</div>';
}

/* Inline symptom filter for the ambiguous screen: parents tick symptoms
 * they've noticed and the candidate list re-orders live around their picks.
 * Nothing is ever hidden for good — unticking restores the full list. */
function ambFilterSymptoms() {
  var seen = {}, out = [];
  G.candidates.forEach(function (d) {
    phenosFor(d.id).forEach(function (p) {
      if (phenoGroupIndex(p) === LAB_GI) return;
      var lbl = String(p.label || '').toLowerCase();
      /* Inheritance patterns and onset timing aren't observable symptoms. */
      if (lbl.indexOf('inheritance') !== -1 || / onset$/.test(lbl)) return;
      var k = String(p.id || p.label).toLowerCase();
      if (!seen[k]) { seen[k] = { p: p, n: 0 }; out.push(seen[k]); }
      seen[k].n++;
    });
  });
  var total = G.candidates.length;
  out.sort(function (a, b) {
    /* Distinguishing symptoms first: present in some but not all candidates. */
    var da = (a.n > 0 && a.n < total) ? 0 : 1, db = (b.n > 0 && b.n < total) ? 0 : 1;
    if (da !== db) return da - db;
    return phenoDegree(b.p) - phenoDegree(a.p);
  });
  return out.slice(0, 16).map(function (s) { return s.p; });
}
function ambMatchCount(d) {
  var f = G.ambFilter || {}, n = 0;
  phenosFor(d.id).forEach(function (p) {
    if (f[String(p.id || p.label).toLowerCase()]) n++;
  });
  return n;
}
function ambFilterHTML() {
  if (!G.candidates || G.candidates.length < 2 || G.via === 'symptoms') return '';
  var syms = ambFilterSymptoms();
  if (!syms.length) return '';
  var f = G.ambFilter || {};
  var boxes = syms.map(function (p) {
    var k = String(p.id || p.label).toLowerCase();
    return '<label class="guide-check"><input type="checkbox" data-ambph="' + esc2(k) + '"' + (f[k] ? ' checked' : '') + '> ' + esc2(plainSymptom(p.label)) + '</label>';
  }).join('');
  return '<div class="guide-amfilter"><h3 class="guide-h3">Not sure which one? Tick symptoms you\u2019ve noticed.</h3>' +
    '<p class="guide-fine">The list below re-orders itself around your picks, most matches first. Untick to see everything again \u2014 nothing is hidden for good.</p>' +
    '<div class="guide-checks">' + boxes + '</div></div>';
}
function ambCardsHTML() {
  var f = G.ambFilter || {};
  var picked = Object.keys(f).filter(function (k) { return f[k]; });
  var ranked = G.candidates.slice().sort(function (a, b) { return ambMatchCount(b) - ambMatchCount(a); });
  return ranked.map(function (d) {
    /* Candidate cards speak plain language: skip lab/enzyme findings (not
     * something a parent can recognize) and translate the rest. */
    var cardPhenos = phenosFor(d.id).filter(function (p) { return phenoGroupIndex(p) !== LAB_GI; });
    if (cardPhenos.length < 3) cardPhenos = phenosFor(d.id).slice(0, 3);
    else cardPhenos = cardPhenos.slice(0, 3);
    var phenos = cardPhenos.map(function (p) { return esc2(plainSymptom(p.label)); }).join('; ');
    var nOrg = orgsFor(d.id).length;
    var badge = picked.length
      ? '<span class="guide-cand-m' + (ambMatchCount(d) > 0 ? ' hit' : '') + '">' +
        (ambMatchCount(d) > 0 ? 'Matches ' + ambMatchCount(d) + ' of ' + picked.length + ' you picked' : 'Doesn\u2019t match what you picked \u2014 still listed so nothing is missed') + '</span>'
      : '';
    return '<button type="button" class="guide-cand" data-pick="' + d.id + '" aria-label="' + esc2(guideName(d)) + '">' +
      '<strong>' + esc2(guideName(d)) + '</strong>' + badge +
      (phenos ? '<span class="guide-cand-ph">' + phenos + '</span>' : '') +
      (nOrg ? '<span class="guide-cand-n">' + nOrg + ' patient group' + (nOrg === 1 ? '' : 's') + ' connected</span>'
            : '<span class="guide-cand-n">Patient-group data not yet recorded</span>') +
      '</button>';
  }).join('');
}

function vAmbiguous() {
  if (!G.candidates || !G.candidates.length) return vSearch();
  var via = G.via === 'symptoms'
    ? 'Based on the symptoms you described, these are the closest matches in our data.'
    : 'A few conditions match what you typed.';
  var compare = (G.candidates.length > 1) ? compareHTML(G.candidates) : '';
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="search">&larr; Start over</button>' +
    '<h2 class="guide-h">Let&rsquo;s narrow it down.</h2>' +
    stepLine(2) +
    roleLine() +
    '<p class="guide-sub">' + via + ' Only a clinician can diagnose &mdash; pick the one that sounds closest, or tell us none fit.</p>' +
    compare +
    ambFilterHTML() +
    '<div class="guide-cands">' + ambCardsHTML() + '</div>' +
    '<button type="button" class="btn" data-nav="nomatch">None of these seem right</button>' +
    '</div>';
}
/* ---- No match: honest, never a dead end ---- */

function vNoMatch() {
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="search">&larr; Try different words</button>' +
    '<h2 class="guide-h">Here&rsquo;s what we know &mdash; and what we don&rsquo;t.</h2>' +
    stepLine(4) +
    roleLine() +
    '<p class="guide-sub">We looked through our data and couldn&rsquo;t match what you described to a condition we cover. ' +
    'That doesn&rsquo;t mean nothing exists &mdash; it means <em>we</em> don&rsquo;t have it. Our atlas currently covers 51 lysosomal storage diseases.</p>' +
    '<div class="guide-action-card"><strong>Your next step:</strong> talk to a <strong>geneticist or genetic counselor</strong> &mdash; they can order the right tests. ' +
    '<a href="https://www.acmg.net/" target="_blank" rel="noopener">Find one near you</a></div>' +
    '<h3 class="guide-h3">Other paths</h3>' +
    '<ul class="guide-list">' +
    '<li><strong>Join NORD&rsquo;s community</strong> &mdash; the National Organization for Rare Disorders helps undiagnosed families. ' +
    '<a href="https://rarediseases.org/" target="_blank" rel="noopener">rarediseases.org</a></li>' +
    '<li><strong>Try different words</strong> &mdash; a gene name, a symptom, or part of the diagnosis you remember. ' +
    '<button type="button" class="guide-link" data-nav="search">Search again</button></li>' +
    '</ul>' +
    '<p class="guide-fine">You&rsquo;re doing the right thing by looking. An unclear answer today can still lead somewhere tomorrow.</p>' +
    bridgeHTML() +
    '</div>';
}

/* ---- Step 4 of 4: ONE recommended action ---- */

/* Concrete, honest, never invented. If no orgs/trials exist in the data, says
 * so plainly and routes to a specialist or the NORD helpline. */
function orgLinkHTML(o) {
  var url = (o.extra && o.extra.url) || null;
  if (url) return '<a href="' + esc2(safeUrl(url)) + '" target="_blank" rel="noopener">' + esc2(o.label) + '</a>';
  return esc2(o.label);
}
function geneticistHTML() {
  return '<p class="guide-sub">Ask your doctor for a referral to a <strong>geneticist or genetic counselor</strong> who knows this condition, ' +
    'or find one near you through <a href="https://www.acmg.net/" target="_blank" rel="noopener">the American College of Medical Genetics</a>. ' +
    'The <a href="https://rarediseases.org/" target="_blank" rel="noopener">NORD helpline</a> can also point you to resources.</p>';
}

function recommendAction(d, role, certain) {
  var orgs = orgsFor(d.id), rec = recruitingTrials(d.id), trials = trialsFor(d.id);
  var dn = esc2(guideName(d));
  var out = { title: '', body: '', print: false, links: '' };

  if (!certain) {
    // Possible match: the honest move is a clinician, with a printed summary.
    out.title = 'Bring this summary to a geneticist';
    out.body = '<p class="guide-sub">Only a clinician &mdash; and usually a genetic test &mdash; can say whether <strong>' + dn + '</strong> ' +
      'is what&rsquo;s happening. That&rsquo;s not a failure of your searching; it&rsquo;s how rare conditions work.</p>' +
      '<p class="guide-sub">Print the one-page summary below and take it to a <strong>geneticist or genetic counselor</strong>. ' +
      'It gathers everything our atlas holds on this condition, so you don&rsquo;t have to remember it all.</p>';
    out.print = true;
    out.links = '<div class="guide-btnrow"><button type="button" class="btn primary" data-nav="export">Print your summary &rarr;</button></div>' +
      '<p class="guide-fine">Not diagnosed yet? The <a href="https://rarediseases.org/" target="_blank" rel="noopener">NORD undiagnosed-disease resources</a> are built for exactly this situation.</p>';
    return out;
  }

  if (role === 'researcher') {
    out.title = 'Open the research workspace';
    out.body = '<p class="guide-sub">For <strong>' + dn + '</strong>, our atlas holds: <strong>' + trials.length + '</strong> studies recorded' +
      (rec.length ? ' (' + rec.length + ' recruiting now)' : '') + ', <strong>' + orgs.length + '</strong> patient organizations, ' +
      '<strong>' + genesFor(d.id).length + '</strong> genes, and <strong>' + relatedFor(d.id).length + '</strong> connected conditions.</p>' +
      '<p class="guide-sub">The research workspace opens the full graph around this condition.</p>';
    out.links = '<div class="guide-btnrow"><button type="button" class="btn primary" data-go-tab="explore">Open the Explore research workspace &rarr;</button></div>';
    return out;
  }

  if (role === 'scout') {
    out.title = 'Ask a clinician about these recruiting studies';
    if (rec.length) {
      out.body = '<p class="guide-sub"><strong>' + rec.length + '</strong> of <strong>' + trials.length + '</strong> studies recorded for <strong>' + dn + '</strong> ' +
        'are recruiting right now:</p><ul class="guide-list">' +
        rec.slice(0, 4).map(function (t) {
          var p = trialPlain(t);
          return '<li>' + esc2(humanize(p.title)) + ' &mdash; ' + esc2(p.meta) + ' &middot; <a href="' + esc2(safeUrl(p.url)) + '" target="_blank" rel="noopener">view</a></li>';
        }).join('') + '</ul>' +
        '<p class="guide-fine">Most experimental treatments never become approved medicines. Bring these to a clinician to weigh eligibility and risks.</p>';
    } else if (trials.length) {
      out.title = 'Check ClinicalTrials.gov for the latest';
      out.body = '<p class="guide-sub">We have <strong>' + trials.length + '</strong> studies recorded for <strong>' + dn + '</strong>, ' +
        'but none are recruiting in our data right now. Trials open and close often &mdash; ' +
        '<a href="https://clinicaltrials.gov/" target="_blank" rel="noopener">search ClinicalTrials.gov</a> for the current picture.</p>';
    } else {
      out.title = 'No studies recorded — ask a specialist';
      out.body = '<p class="guide-sub">We don&rsquo;t have any studies recorded for <strong>' + dn + '</strong>. ' +
        'That doesn&rsquo;t mean none exist &mdash; it means <em>we</em> don&rsquo;t have them.</p>' + geneticistHTML();
    }
    return out;
  }

  if (role === 'org') {
    if (orgs.length) {
      out.title = 'Connect with these peer organizations';
      out.body = '<p class="guide-sub"><strong>' + orgs.length + '</strong> patient organizations are recorded for <strong>' + dn + '</strong>. ' +
        'They&rsquo;ve already solved problems you&rsquo;re about to face &mdash; registries, study design, hard-won experience:</p><ul class="guide-list">' +
        orgs.slice(0, 4).map(function (o) { return '<li>' + orgLinkHTML(o) + '</li>'; }).join('') + '</ul>' +
        '<p class="guide-sub">Next, look at what&rsquo;s still missing: open the <a href="#" data-go-tab="gaps">Gaps &amp; Limits</a> tab for this condition.</p>';
    } else {
      out.title = 'Help find or start a community';
      out.body = '<p class="guide-sub">We don&rsquo;t have a patient group recorded for <strong>' + dn + '</strong>. ' +
        '<a href="https://rarediseases.org/" target="_blank" rel="noopener">NORD</a> can help you find or start one &mdash; and you&rsquo;re allowed to be the one who starts it.</p>';
    }
    return out;
  }

  // Living with the condition themselves: same honesty, framed for self.
  if (role === 'patient') {
    if (orgs.length) {
      out.title = 'Connect with people who live with this';
      out.body = '<p class="guide-sub">Our data holds <strong>' + orgs.length + '</strong> patient groups for <strong>' + dn + '</strong>. ' +
        'They talk to people living with this every day &mdash; about care, doctors who know the condition, and what others have learned:</p><ul class="guide-list">' +
        orgs.slice(0, 4).map(function (o) { return '<li>' + orgLinkHTML(o) + '</li>'; }).join('') + '</ul>' +
        '<p class="guide-fine">Reaching out is the single most useful first step. Ask your doctor before acting on anyone&rsquo;s advice.</p>';
    } else if (rec.length) {
      out.title = 'Ask your doctor about these recruiting studies';
      out.body = '<p class="guide-sub">Our data holds <strong>' + rec.length + '</strong> studies recruiting right now for <strong>' + dn + '</strong>:</p><ul class="guide-list">' +
        rec.slice(0, 4).map(function (t) {
          var p = trialPlain(t);
          return '<li>' + esc2(humanize(p.title)) + ' &mdash; ' + esc2(p.meta) + ' &middot; <a href="' + esc2(safeUrl(p.url)) + '" target="_blank" rel="noopener">view</a></li>';
        }).join('') + '</ul>' +
        '<p class="guide-fine">Most experimental treatments never become approved medicines. Bring these to your doctor to weigh eligibility and risks.</p>';
    } else {
      out.title = 'Start with a specialist who knows this condition';
      out.body = '<p class="guide-sub">We don&rsquo;t have patient groups or recruiting studies recorded for <strong>' + dn + '</strong> yet. ' +
        'That doesn&rsquo;t mean none exist &mdash; it means <em>we</em> don&rsquo;t have them.</p>' + geneticistHTML();
    }
    return out;
  }

  // Default: caring for someone (and no role picked).
  if (orgs.length) {
    out.title = 'Contact one of these patient organizations';
    out.body = '<p class="guide-sub">Our data holds <strong>' + orgs.length + '</strong> patient groups for <strong>' + dn + '</strong>. ' +
      'They talk to families like yours every day &mdash; about care, doctors who know the condition, and what other families have learned:</p><ul class="guide-list">' +
      orgs.slice(0, 4).map(function (o) { return '<li>' + orgLinkHTML(o) + '</li>'; }).join('') + '</ul>' +
      '<p class="guide-fine">Reaching out is the single most useful first step. Ask your doctor before acting on anyone&rsquo;s advice.</p>';
  } else if (rec.length) {
    out.title = 'Ask your doctor about these recruiting studies';
    out.body = '<p class="guide-sub">Our data holds <strong>' + rec.length + '</strong> studies recruiting right now for <strong>' + dn + '</strong>:</p><ul class="guide-list">' +
      rec.slice(0, 4).map(function (t) {
        var p = trialPlain(t);
        return '<li>' + esc2(humanize(p.title)) + ' &mdash; <a href="' + esc2(safeUrl(p.url)) + '" target="_blank" rel="noopener">view</a></li>';
      }).join('') + '</ul>' +
      '<p class="guide-fine">Ask your doctor whether any could be a fit. Research studies are early steps, not approved treatments.</p>';
  } else {
    out.title = 'Contact a specialist or the NORD helpline';
    out.body = '<p class="guide-sub">We don&rsquo;t have a patient group or recruiting studies recorded for <strong>' + dn + '</strong>. ' +
      'We&rsquo;d rather say that plainly than pretend. The most useful next step is a human who knows this condition:</p>' + geneticistHTML();
  }
  return out;
}

function otherPathsHTML(d) {
  var nOrg = orgsFor(d.id).length, nTrial = trialsFor(d.id).length, nRel = relatedFor(d.id).length;
  function b(nav, label, sub) {
    return '<div class="guide-op-row"><button type="button" class="btn" data-nav="' + nav + '">' + label + '</button>' +
      (sub ? ' <span class="guide-op-sub">&mdash; ' + sub + '</span>' : '') + '</div>';
  }
  return '<details class="guide-otherpaths"><summary>Other paths</summary>' +
    '<div class="guide-otherpaths-btns">' +
    b('understand', 'Understand what this means', 'plain-language basics') +
    b('families', 'Talk to another family', nOrg + ' patient group' + (nOrg === 1 ? '' : 's')) +
    b('research', 'See what research is happening', nTrial + ' studies recorded') +
    b('connections', 'Related communities', nRel + ' connected condition' + (nRel === 1 ? '' : 's')) +
    b('export', 'Print your full dossier', 'take it to your doctor') +
    '</div></details>';
}

function vAction() {
  var d = nodesById[G.diseaseId];
  if (!d) return vSearch();
  var rec = recommendAction(d, G.role, G.certain);
  var ak = alsoCalled(d);
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="confirm">&larr; Back</button>' +
    '<h2 class="guide-h">Your next step: <span class="hl">' + rec.title + '</span></h2>' +
    stepLine(4) +
    roleLine() +
    '<p class="guide-sub">For <strong>' + esc2(guideName(d)) + '</strong>' +
    (ak ? ' <span class="guide-fine">(also called: ' + esc2(ak) + ')</span>' : '') + '.</p>' +
    '<div class="guide-action-card">' + rec.body + rec.links + '</div>' +
    '<p class="guide-fine">Only a clinician can make a diagnosis. Everything here is what our data actually holds &mdash; not medical advice.</p>' +
    otherPathsHTML(d) +
    bridgeHTML() +
    '</div>';
}
/* ---- Other paths (collapsed under the action screen; back returns there) ---- */

function vFamilies() {
  var d = nodesById[G.diseaseId];
  var orgs = orgsFor(d.id);
  var cards = orgs.map(function (o) {
    var url = (o.extra && o.extra.url) || null;
    return '<div class="guide-org">' +
      '<strong>' + esc2(o.label) + '</strong>' +
      '<span class="verified">✓ Verified non-profit &mdash; listed in a trusted directory</span>' +
      (o.description ? '<p>' + esc2(o.description) + '</p>' : '') +
      (url ? '<a class="btn small" href="' + esc2(safeUrl(url)) + '" target="_blank" rel="noopener">Visit their site &rarr;</a>' : '') +
      '</div>';
  }).join('');
  if (!cards) cards = '<p class="guide-sub">We don&rsquo;t have a patient group recorded for this condition yet. ' +
    '<a href="https://rarediseases.org/" target="_blank" rel="noopener">NORD</a> can help you find or start one.</p>';
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="action">&larr; Your next step</button>' +
    '<h2 class="guide-h">Families facing ' + esc2(guideName(d)) + '</h2>' +
    '<p class="guide-sub">These organizations exist to talk to families like yours. Reaching out is the single most useful first step.</p>' +
    cards +
    '<div class="guide-safety">We never share your information. These groups are curated from trusted directories (NORD, Orphanet, Global Genes). ' +
    'Always check with your doctor before acting on anyone&rsquo;s advice.</div>' +
    bridgeHTML() +
    '</div>';
}

function vUnderstand() {
  var d = nodesById[G.diseaseId];
  var genes = genesFor(d.id);
  var phenos = phenosFor(d.id).slice(0, 8);
  var geneBit = '';
  if (genes.length) {
    var g = genes[0];
    var desc = (g.description || '').split('. ')[0];
    geneBit = '<h3 class="guide-h3">What&rsquo;s happening in the body</h3>' +
      '<p>Everyone has a gene called <strong>' + esc2(g.label) + '</strong>. ' + esc2(desc) + '.</p>' +
      '<p>In ' + esc2(guideName(d)) + ', this gene doesn&rsquo;t work the way it should, so waste builds up in cells over time.</p>';
  }
  var phenoBit = phenos.length
    ? '<h3 class="guide-h3">What families often notice</h3><ul class="guide-list">' +
      phenos.map(function (p) { return '<li>' + esc2(plainSymptom(p.label)) + '</li>'; }).join('') + '</ul>' +
      '<p class="guide-fine">Every child is different. Doctors can&rsquo;t predict exactly how things will change for your child &mdash; some progress slowly, some faster.</p>'
    : '';
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="action">&larr; Your next step</button>' +
    '<h2 class="guide-h">Understanding ' + esc2(guideName(d)) + '</h2>' +
    '<p class="guide-fine">Written in plain language. Tap any <span class="gloss">underlined term</span> anywhere in the atlas for its definition.</p>' +
    geneBit + phenoBit +
    '<h3 class="guide-h3">What we don&rsquo;t know yet</h3>' +
    '<p>Research hasn&rsquo;t answered everything about this condition. Where our data has gaps, we show them plainly instead of guessing &mdash; ' +
    'see the <a href="#" data-go-tab="gaps">Gaps &amp; Limits</a> tab.</p>' +
    '<div class="guide-btnrow"><button type="button" class="btn primary" data-nav="families">Talk to other parents about what to expect &rarr;</button></div>' +
    bridgeHTML() +
    '</div>';
}

function trialPlain(t) {
  var ex = t.extra || {};
  var status = (ex.status || '').toLowerCase().replace(/_/g, ' ');
  var bits = [];
  if (ex.sponsor) bits.push('Run by ' + ex.sponsor);
  if (ex.nct) bits.push(ex.nct);
  return {
    title: t.label.length > 90 ? t.label.slice(0, 90) + '…' : t.label,
    meta: bits.join(' · ') + (status ? ' · ' + status : ''),
    url: ex.url || ('https://clinicaltrials.gov/study/' + (ex.nct || ''))
  };
}

function vResearch() {
  var d = nodesById[G.diseaseId];
  var trials = trialsFor(d.id);
  var rec = recruitingTrials(d.id);
  var cards = trials.slice(0, 6).map(function (t) {
    var p = trialPlain(t);
    var isRec = p.meta.indexOf('recruiting') !== -1;
    return '<div class="guide-trial">' +
      '<strong>' + esc2(humanize(p.title)) + '</strong>' +
      '<span class="guide-trial-meta">' + esc2(p.meta) + '</span>' +
      '<p class="guide-fine">This is a research study testing a possible treatment &mdash; not an approved medicine.</p>' +
      '<div class="guide-btnrow"><a class="btn small" href="' + esc2(safeUrl(p.url)) + '" target="_blank" rel="noopener">View on ClinicalTrials.gov &rarr;</a>' +
      (isRec ? '<button type="button" class="btn small" data-go-tab="action">Check eligibility &rarr;</button>' : '') + '</div>' +
      '</div>';
  }).join('');
  if (!cards) cards = '<p class="guide-sub">No studies are recorded for this condition in our data right now. That doesn&rsquo;t mean none exist &mdash; ' +
    'try searching <a href="https://clinicaltrials.gov/" target="_blank" rel="noopener">ClinicalTrials.gov</a> directly, or ask your doctor.</p>';
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="action">&larr; Your next step</button>' +
    '<h2 class="guide-h">What research is happening</h2>' +
    '<p class="guide-sub">' + trials.length + ' studies recorded for ' + esc2(guideName(d)) +
    (rec.length ? ', <strong>' + rec.length + ' recruiting now</strong>' : '') + '.</p>' +
    cards +
    '<div class="guide-honesty"><strong>Important context:</strong> Most experimental treatments never become approved medicines. ' +
    'These studies are early steps in a long process &mdash; often 5&ndash;10 years to approval <em>if</em> they succeed. ' +
    'We share them because participating might help your child <em>and</em> future families &mdash; not because success is guaranteed. ' +
    'Talk to your doctor before deciding anything.</div>' +
    bridgeHTML() +
    '</div>';
}

function vConnections() {
  var d = nodesById[G.diseaseId];
  var rel = relatedFor(d.id).slice(0, 6);
  var myMechs = mechsFor(d.id).map(function (m) { return m.id; });
  var cards = rel.map(function (r) {
    var shared = mechsFor(r.node.id).filter(function (m) { return myMechs.indexOf(m.id) !== -1; })
      .map(function (m) { return esc2(humanize(m.label)); }).join(', ');
    var rOrgs = orgsFor(r.node.id);
    return '<div class="guide-conn">' +
      '<strong>' + esc2(guideName(r.node)) + '</strong>' +
      (shared ? '<p><strong>Why connected:</strong> shares ' + shared + '.</p>' : '<p><strong>Why connected:</strong> linked in our data by shared biology.</p>') +
      (rOrgs.length ? '<p><strong>Their community:</strong> ' + esc2(rOrgs[0].label) + (rOrgs.length > 1 ? ' (+' + (rOrgs.length - 1) + ' more)' : '') + '</p>' : '') +
      '<p class="guide-fine">A shared mechanism does <em>not</em> mean a treatment transfers &mdash; that needs separate proof. ' +
      'These connections show where to look, not what to promise.</p>' +
      '</div>';
  }).join('');
  if (!cards) cards = '<p class="guide-sub">No related conditions are recorded for this disease in our data yet.</p>';
  return '<div class="guide-pane">' +
    '<button type="button" class="guide-back" data-nav="action">&larr; Your next step</button>' +
    '<h2 class="guide-h">Related communities</h2>' +
    '<p class="guide-sub">Conditions that share biology with ' + esc2(guideName(d)) + '. Their communities may have built things yours can reuse &mdash; ' +
    'registries, study designs, hard-won experience.</p>' +
    cards +
    '<div class="guide-btnrow"><button type="button" class="btn primary" data-nav="export">Create your full dossier &rarr;</button></div>' +
    bridgeHTML() +
    '</div>';
}
/* ---- Dossier (printable; kept whole, back returns to the action screen) ---- */

function journeyHTML(d) {
  var bits = [];
  if (G.query) bits.push('You searched for &ldquo;' + esc2(G.query) + '&rdquo;.');
  var nCand = (G.candidates || []).length;
  if (nCand > 1) bits.push(nCand + ' conditions matched.');
  var picked = (G.confirmedPhenos || []).map(function (k) { return plainSymptom(phenoLabel(k)); }).filter(Boolean);
  if (picked.length) bits.push('You recognized these symptoms: <strong>' + esc2(picked.join('; ')) + '</strong>.');
  else bits.push('You skipped the symptom check.');
  bits.push('You chose to explore <strong>' + esc2(guideName(d)) + '</strong>. Only a clinician can diagnose.');
  return '<h3 class="guide-h3">How you got here</h3><p>' + bits.join(' ') + '</p>' +
    '<p class="guide-fine">This is the path you took through the guide, so a clinician can see what you already considered.</p>';
}

function vExport() {
  var d = nodesById[G.diseaseId];
  if (!d) return vSearch();
  var orgs = orgsFor(d.id), trials = trialsFor(d.id), rel = relatedFor(d.id).slice(0, 6);
  var genes = genesFor(d.id), phenos = phenosFor(d.id), assets = assetsFor(d.id);
  var quotes = quotesFor(d.id, 3);
  var eps = endpointsForDossier(d.id);
  var aka = alsoCalled(d);
  var what = (d.description || '').split('. ').slice(0, 2).join('. ') + ((d.description || '').indexOf('.') !== -1 ? '.' : '');
  var cluster = GRAPH.clusters ? GRAPH.clusters.filter(function (c) { return c.id === d.cluster_id; })[0] : null;
  var gaps = (cluster && cluster.gaps) || [];
  var rec = trials.filter(function (t) { return ((t.extra && t.extra.status) || '').toUpperCase().indexOf('RECRUIT') === 0; });
  var others = trials.filter(function (t) { return ((t.extra && t.extra.status) || '').toUpperCase().indexOf('RECRUIT') !== 0; });

  var h = '<div class="guide-pane" id="guideExportDoc">' +
    '<button type="button" class="guide-back" data-nav="action">&larr; Your next step</button>' +
    '<h2 class="guide-h">Your dossier: ' + esc2(guideName(d)) + '</h2>' +
    '<p class="guide-sub">Everything our atlas holds on this condition, in one place. Take it to your doctor, your family, or your patient group. ' +
    'You&rsquo;re doing the right thing by looking. Generated ' + new Date().toLocaleDateString() + '.</p>' +
    therapyBannerHTML(d) +
    journeyHTML(d) +
    '<div class="guide-nextstep"><strong>What to do next:</strong> ' + nextStepFor(d.id) + '</div>';

  h += '<h3 class="guide-h3">What this condition is</h3>' +
    (what ? '<p>' + esc2(what) + '</p>' : '<p class="guide-fine">A plain-language description isn&rsquo;t recorded yet.</p>') +
    (aka ? '<p class="guide-fine">Also called: ' + esc2(aka) + '</p>' : '');

  h += '<h3 class="guide-h3">Genes involved</h3>' +
    (genes.length ? '<ul class="guide-list">' + genes.map(function (g) { return '<li><strong>' + esc2(g.label) + '</strong></li>'; }).join('') + '</ul>'
      : '<p class="guide-fine">We don&rsquo;t have the gene recorded yet.</p>');

  h += '<h3 class="guide-h3">Symptoms families often notice</h3>' +
    (phenos.length ? '<ul class="guide-list">' + phenos.slice(0, 10).map(function (p) { return '<li>' + esc2(plainSymptom(p.label)) + '</li>'; }).join('') + '</ul>'
      : '<p class="guide-fine">We don&rsquo;t have symptoms recorded yet.</p>') +
    '<p class="guide-fine">Every child is different &mdash; this list can&rsquo;t predict your child&rsquo;s path. Only a clinician can diagnose.</p>';

  h += '<h3 class="guide-h3">Measurements researchers share</h3>';
  if (eps === null) h += '<p class="guide-fine">Endpoint data isn&rsquo;t loaded in this view.</p>';
  else if (!eps.length) h += '<p class="guide-fine">No shared measurements recorded for this condition yet.</p>';
  else h += '<ul class="guide-list">' + eps.slice(0, 8).map(function (r) {
    return '<li><strong>' + esc2(r.ep.term) + '</strong> &mdash; ' + esc2(r.ep.plain || '') + '</li>';
  }).join('') + '</ul>' +
    '<p class="guide-fine">Sharing a measurement is not sharing biology &mdash; a common test lets studies compare results, it doesn&rsquo;t mean a treatment transfers.</p>';

  h += '<h3 class="guide-h3">Studies (' + trials.length + ' recorded)</h3>';
  if (rec.length) h += '<p><strong>Recruiting now:</strong></p><ul class="guide-list">' + rec.map(function (t) {
    var p = trialPlain(t); return '<li>' + esc2(humanize(p.title)) + ' &mdash; ' + esc2(p.meta) + '</li>';
  }).join('') + '</ul>';
  if (others.length) h += (rec.length ? '<p><strong>Other studies:</strong></p>' : '') + '<ul class="guide-list">' + others.slice(0, 6).map(function (t) {
    var p = trialPlain(t); return '<li>' + esc2(humanize(p.title)) + ' &mdash; ' + esc2(p.meta) + '</li>';
  }).join('') + '</ul>';
  if (!trials.length) h += '<p class="guide-fine">No studies recorded yet.</p>';

  h += '<h3 class="guide-h3">Support groups</h3>' +
    (orgs.length ? '<ul class="guide-list">' + orgs.map(function (o) {
      var url = (o.extra && o.extra.url) || '';
      return '<li><strong>' + esc2(o.label) + '</strong>' + (url ? ' &mdash; ' + esc2(url) : '') + '</li>';
    }).join('') + '</ul>' : '<p class="guide-fine">No patient group recorded yet &mdash; <a href="https://rarediseases.org/" target="_blank" rel="noopener">NORD</a> can help you find or start one.</p>');

  h += '<h3 class="guide-h3">Things research can reuse</h3>' +
    (assets.length ? '<ul class="guide-list">' + assets.map(function (a) {
      return '<li><strong>' + esc2(displayName(a)) + '</strong>' + (a.description ? ' &mdash; ' + esc2(a.description.slice(0, 160)) : '') + '</li>';
    }).join('') + '</ul>' : '<p class="guide-fine">No reusable research assets recorded yet.</p>');

  h += '<h3 class="guide-h3">What science has shown</h3>';
  if (quotes.length) h += '<ul class="guide-list">' + quotes.map(function (e) {
    var q = e.source_quote.length > 220 ? e.source_quote.slice(0, 220) + '&hellip;' : e.source_quote;
    return '<li>&ldquo;' + esc2(q) + '&rdquo;<br><span class="guide-fine">Source: ' + esc2(e.source_db || 'atlas') +
      (e.source_ref ? ' ' + esc2(e.source_ref) : '') + ' &mdash; ' + (e.evidence === 'observed' ? 'directly observed' : 'inferred by analysis') + '</span></li>';
  }).join('') + '</ul>';
  else h += '<p class="guide-fine">No quoted evidence recorded yet.</p>';

  h += '<h3 class="guide-h3">Related conditions</h3>' +
    (rel.length ? '<ul class="guide-list">' + rel.map(function (r) { return '<li>' + esc2(guideName(r.node)) + '</li>'; }).join('') + '</ul>'
      : '<p class="guide-fine">None recorded.</p>');

  h += '<h3 class="guide-h3">What we still don&rsquo;t know</h3>' +
    (gaps.length ? '<ul class="guide-list">' + gaps.map(function (g) { return '<li>' + esc2(g) + '</li>'; }).join('') + '</ul>'
      : '<p class="guide-fine">No open gaps recorded for this condition&rsquo;s group.</p>');

  h += '<p class="guide-fine">Sources: every connection in the atlas carries its evidence &mdash; open the Explore tab and click any edge to see the source quote and paper. ' +
    'This dossier is information to discuss with your care team, not medical advice.</p>' +
    '<div class="guide-btnrow"><button type="button" class="btn primary" id="guidePrint">Print / save as PDF</button></div>' +
    bridgeHTML() +
    '</div>';
  return h;
}

/* ---------------- wiring ---------------- */

function wireGuide(scope) {
  var q = scope.querySelector('#guideQ');
  var goBtn = scope.querySelector('#guideGo');
  function submit() {
    var val = q ? q.value : '';
    if (!val.trim()) {
      var hint = scope.querySelector('#guideHint');
      if (!hint && q && q.parentNode) {
        hint = document.createElement('p');
        hint.id = 'guideHint';
        hint.className = 'guide-hint';
        hint.setAttribute('aria-live', 'polite');
        hint.textContent = 'Tell us what brings you here first — a diagnosis name, a gene, or even symptoms like "he has seizures".';
        q.parentNode.appendChild(hint);
      }
      if (q) q.focus();
      return;
    }
    G.query = val;
    var r = interpret(val);
    if (r.kind === 'disease') { G.diseaseId = r.id; G.candidates = []; G.via = null; G.certain = null; G.confirmedPhenos = []; G.phenoExpanded = false; go('confirm'); }
    else if (r.kind === 'ambiguous') { G.candidates = r.candidates; G.via = r.via; G.ambFilter = {}; go('ambiguous'); }
    else go('nomatch');
  }
  if (goBtn) goBtn.addEventListener('click', submit);
  if (q) q.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  scope.querySelectorAll('[data-ex]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (q) q.value = b.getAttribute('data-ex');
      submit();
    });
  });
  scope.querySelectorAll('[data-role]').forEach(function (b) {
    b.addEventListener('click', function () { setRole(b.getAttribute('data-role')); go('search'); });
  });
  scope.querySelectorAll('[data-nav]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.classList && b.classList.contains('guide-link') && b.getAttribute('data-nav') === 'landing') { /* role change */ }
      go(b.getAttribute('data-nav'));
    });
  });
  scope.querySelectorAll('[data-pick]').forEach(function (b) {
    b.addEventListener('click', function () { G.diseaseId = b.getAttribute('data-pick'); G.certain = null; G.confirmedPhenos = seedConfirmedFromFilter(G.diseaseId); G.phenoExpanded = false; go('confirm'); });
  });
  scope.querySelectorAll('[data-certain]').forEach(function (b) {
    b.addEventListener('click', function () {
      G.certain = b.getAttribute('data-certain') === 'yes';
      var atlas = window.__atlas;
      if (atlas && atlas.setDisease && G.diseaseId) atlas.setDisease(G.diseaseId);
      go('action');
    });
  });
  scope.querySelectorAll('[data-skip-check]').forEach(function (b) {
    b.addEventListener('click', function () {
      var atlas = window.__atlas;
      if (atlas && atlas.setDisease && G.diseaseId) atlas.setDisease(G.diseaseId);
      go('action');
    });
  });
  scope.querySelectorAll('input[data-ph]').forEach(function (box) {
    box.addEventListener('change', function () {
      var phenos = confirmPhenos();
      var p = phenos[parseInt(box.getAttribute('data-ph'), 10)];
      if (!p) return;
      var key = p.id || p.label;
      G.confirmedPhenos = G.confirmedPhenos || [];
      var i = G.confirmedPhenos.indexOf(key);
      if (box.checked && i === -1) G.confirmedPhenos.push(key);
      if (!box.checked && i !== -1) G.confirmedPhenos.splice(i, 1);
    });
  });
  scope.querySelectorAll('input[data-ambph]').forEach(function (box) {
    box.addEventListener('change', function () {
      G.ambFilter = G.ambFilter || {};
      var k = box.getAttribute('data-ambph');
      if (box.checked) G.ambFilter[k] = true; else delete G.ambFilter[k];
      /* Re-render only the cards, in place — no scroll jump. */
      var cands = scope.querySelector('.guide-cands');
      if (cands) {
        cands.innerHTML = ambCardsHTML();
        cands.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () { G.diseaseId = b.getAttribute('data-pick'); G.certain = null; G.confirmedPhenos = seedConfirmedFromFilter(G.diseaseId); G.phenoExpanded = false; go('confirm'); });
        });
      }
    });
  });
  var more = scope.querySelector('#phenoMore');
  if (more) more.addEventListener('click', function () { G.phenoExpanded = true; go('confirm'); });
  var pr = scope.querySelector('#guidePrint');
  if (pr) pr.addEventListener('click', function () { window.print(); });
}

function initGuide() {
  renderGuide();
}

function guideBoot() {
  if (!window.__atlasReady || typeof GRAPH === 'undefined' || !GRAPH) { setTimeout(guideBoot, 250); return; }
  initGuide();
  // Debug/test handle (harmless in production), mirrors window.__atlas in app.js.
  window.__guide = { interpret: interpret, guideName: guideName, orgsFor: orgsFor, trialsFor: trialsFor, phenosFor: phenosFor, genesFor: genesFor, relatedFor: relatedFor, researchersFor: researchersFor, recruitingTrials: recruitingTrials, recommendAction: recommendAction, go: go, setRole: setRole, getRole: getRole, state: G };
}
guideBoot();

})();
