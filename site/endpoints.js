/* AI Atlas — Endpoints lens (endpoints.js).
 * Additive view: diseases grouped by SHARED measurable clinical endpoints and
 * biomarkers, not by mechanism. Answers "how can we run trials together?"
 * Loads after app.js/views.js; uses their globals (GRAPH, nodesById, esc,
 * displayName, linkifyRef, incidentEdges, shortLabel).
 * RULE: never invent facts. Endpoint DEFINITIONS are curated from the review
 * spec (labeled as such); every DISEASE MEMBERSHIP is derived at runtime from
 * graph.json edges (disease-gene, disease-phenotype). Anything not derivable
 * is labeled "candidate — needs validation" or "unknown".
 */
'use strict';

/* ---------------- disease families (the 16-disease slice) ---------------- */

var EP_FAMILIES = [
  { id: 'gaucher',  name: 'Gaucher disease',            re: /gaucher/i, exclude: /parkinson|lewy/i },
  { id: 'fabry',    name: 'Fabry disease',              re: /fabry/i },
  { id: 'pompe',    name: 'Pompe disease',              re: /acid maltase|glycogen storage disease ii/i },
  { id: 'npab',     name: 'Niemann-Pick A/B',           re: /niemann-pick disease type [ab](?![\w])/i },
  { id: 'npc',      name: 'Niemann-Pick C',             re: /niemann-pick disease[,\s]*type c/i },
  { id: 'taysachs', name: 'Tay-Sachs disease',          re: /tay-sachs/i },
  { id: 'sandhoff', name: 'Sandhoff disease',           re: /sandhoff/i },
  { id: 'mps1',     name: 'MPS I (Hurler/Scheie)',      re: /hurler|scheie|mucopolysaccharidosis type 1(?![\d])/i },
  { id: 'mps2',     name: 'MPS II (Hunter)',            re: /mucopolysaccharidosis type 2/i },
  { id: 'mps3a',    name: 'Sanfilippo A (MPS IIIA)',    re: /mucopolysaccharidosis type 3a/i },
  { id: 'mps3b',    name: 'Sanfilippo B (MPS IIIB)',    re: /mucopolysaccharidosis type 3b/i },
  { id: 'mps3c',    name: 'Sanfilippo C (MPS IIIC)',    re: /mucopolysaccharidosis type 3c/i },
  { id: 'mps3d',    name: 'Sanfilippo D (MPS IIID)',    re: /mucopolysaccharidosis type 3d/i },
  { id: 'mps3x',    name: 'Sanfilippo (unspecified)',   re: /mucopolysaccharidosis type 3(?![a-d])/i },
  { id: 'krabbe',   name: 'Krabbe disease',             re: /krabbe/i },
  { id: 'mld',      name: 'Metachromatic leukodystrophy', re: /metachromatic leukodystrophy/i }
];

/* ---------------- endpoint catalog (curated definitions) ---------------- */
/* derivation kinds:
 *  'gene'      — family qualifies if a disease in it links (in our graph) to a listed gene
 *  'hpo'       — family qualifies if a disease in it has an HPO phenotype matching the regex
 *  'candidate' — proposed by reviewers; NOT asserted per-disease in our sources                */

var ENDPOINTS = [
  { id: 'ep-hs', tier: 1, term: 'Heparan sulfate (HS)', plain: 'a stored sugar chain, measured in urine or spinal fluid',
    what: 'Heparan sulfate is a sugar chain the broken enzyme should clear. It builds up in MPS diseases.',
    share: 'MPS I and II trials already use HS reduction as an endpoint. Sanfilippo (MPS III) measures HS too — these communities could join one shared "sugar-chain reduction" protocol instead of validating separately.',
    deriv: { kind: 'gene', genes: ['IDUA', 'IDS', 'SGSH', 'NAGLU', 'HGSNAT', 'GNS'],
             label: 'In our graph: diseases linked to genes whose enzymes clear heparan sulfate' } },
  { id: 'ep-ds', tier: 1, term: 'Dermatan sulfate (DS)', plain: 'another stored sugar chain, measured alongside HS',
    what: 'A second sugar chain that builds up in MPS I and II.',
    share: 'MPS I/II trials measure HS+DS together. A shared assay protocol already exists between these two communities.',
    deriv: { kind: 'gene', genes: ['IDUA', 'IDS'],
             label: 'In our graph: diseases linked to genes whose enzymes clear dermatan sulfate' } },
  { id: 'ep-lysogb1', tier: 1, term: 'Lyso-Gb1', plain: 'a fatty substance that builds up in the blood',
    what: 'Globotriaosylsphingosine — a blood marker of substrate buildup in Gaucher and Fabry.',
    share: 'Both communities could co-validate assay platforms, reference ranges, and what counts as a meaningful change.',
    deriv: { kind: 'gene', genes: ['GBA', 'GLA'],
             label: 'In our graph: diseases linked to GBA / GLA (sphingolipid storage genes)' } },
  { id: 'ep-chito', tier: 1, term: 'Chitotriosidase', plain: 'a blood marker of overworked immune cells',
    what: 'An enzyme made by activated macrophages — rises when storage material accumulates.',
    share: 'Any "storage clearance" trial could use it as a secondary endpoint, but it is non-specific: it tracks inflammation, not one disease.',
    caveat: 'Low specificity — a shared number here does not mean shared disease activity.',
    deriv: { kind: 'gene', genes: ['GBA', 'SMPD1', 'NPC1', 'NPC2', 'GLA', 'GALC', 'ARSA'],
             label: 'In our graph: diseases of genes tied to macrophage-activating storage' } },
  { id: 'ep-hexa', tier: 1, term: 'Hexosaminidase A activity', plain: 'the enzyme level, measured in blood',
    what: 'Direct measure of the deficient enzyme in Tay-Sachs and Sandhoff.',
    share: 'The most direct possible shared endpoint: same assay, same meaning, two diseases.',
    deriv: { kind: 'gene', genes: ['HEXA', 'HEXB'],
             label: 'In our graph: diseases linked to HEXA / HEXB' } },
  { id: 'ep-sulfatide', tier: 1, term: 'Sulfatides', plain: 'nerve-coating breakdown products in spinal fluid',
    what: 'Sulfatide accumulation tracks demyelination in the leukodystrophies.',
    share: 'MLD and Krabbe could share sulfatide assay validation and myelin-loss protocols.',
    deriv: { kind: 'gene', genes: ['ARSA', 'GALC'],
             label: 'In our graph: diseases linked to ARSA / GALC (myelin lipid genes)' } },
  { id: 'ep-oxysterol', tier: 1, term: 'Oxysterols', plain: 'cholesterol byproducts in blood',
    what: 'Markers of broken cholesterol trafficking, best validated in Niemann-Pick C.',
    share: 'NPC validation work is a model other cholesterol-related diseases could borrow.',
    deriv: { kind: 'gene', genes: ['NPC1', 'NPC2', 'SMPD1'],
             label: 'In our graph: diseases linked to cholesterol-trafficking genes' } },

  { id: 'ep-nfl', tier: 2, term: 'Neurofilament light chain (NfL)', plain: 'a nerve-damage signal in blood or spinal fluid',
    what: 'Rises with nerve damage, falls when nerves are protected. Increasingly accepted by regulators as a surrogate.',
    share: 'Validating NfL costs millions and takes years. Neurodegenerative LSD communities could pool that work instead of each validating alone.',
    deriv: { kind: 'candidate', hpo: /neurodegeneration|neurodevelopmental regression|brain atrophy|cerebral atrophy|demyelination|leukodystrophy/i,
             label: 'Candidate: diseases in our graph with neurodegeneration phenotypes — NfL use per disease needs validation' } },
  { id: 'ep-gfap', tier: 2, term: 'GFAP', plain: 'a brain-inflammation signal in blood',
    what: 'Glial fibrillary acidic protein — marks astrocyte activation, complementary to NfL.',
    share: 'Could ride along with NfL validation as a paired CNS panel.',
    deriv: { kind: 'candidate', hpo: /neurodegeneration|neurodevelopmental regression|brain atrophy|cerebral atrophy|demyelination|leukodystrophy|neuroinflammation/i,
             label: 'Candidate: diseases in our graph with neurodegeneration phenotypes — per-disease validation needed' } },

  { id: 'ep-seizure', tier: 3, term: 'Seizure frequency', plain: 'how often seizures happen, tracked in a diary',
    what: 'Standard neurology endpoint — epilepsy trials have decades of protocol infrastructure.',
    share: 'These communities could co-develop seizure monitoring protocols and pool natural-history data on seizure progression.',
    caveat: 'Seizures differ by age of onset and type — a shared diary protocol still needs disease-specific validation.',
    deriv: { kind: 'hpo', re: /seizure/i,
             label: 'In our graph: diseases sharing HPO seizure phenotypes' } },
  { id: 'ep-walk', tier: 3, term: '6-minute walk test (6MWT)', plain: 'how far you can walk in 6 minutes',
    what: 'FDA-accepted functional endpoint for muscle weakness and mobility — validated in Pompe.',
    share: 'Pompe blazed the regulatory trail. Any LSD with motor involvement can borrow the protocol and the precedent.',
    caveat: 'Only works for patients who can walk — not applicable in late-stage disease.',
    deriv: { kind: 'hpo', re: /\bgait\b|walking difficulty|muscle weakness|myopathy|skeletal muscle|paraparesis|motor delay/i,
             label: 'In our graph: diseases sharing HPO motor/mobility phenotypes' } },
  { id: 'ep-hearing', tier: 3, term: 'Hearing tests (audiometry / ABR)', plain: 'standard hearing checks',
    what: 'Sensorineural hearing loss is common across MPS types and Fabry.',
    share: 'One shared audiology protocol could serve all of these communities.',
    deriv: { kind: 'hpo', re: /hearing|deafness|sensorineural/i,
             label: 'In our graph: diseases sharing HPO hearing phenotypes' } },
  { id: 'ep-eye', tier: 3, term: 'Eye exams (ERG / OCT / fundoscopy)', plain: 'retina and cornea checks',
    what: 'Cherry-red spots, corneal clouding, retinal changes — fundoscopy protocols transfer directly.',
    share: 'Ophthalmology endpoints are cheap to share: same equipment, same specialists.',
    deriv: { kind: 'hpo', re: /retin|corneal|cherry|optic atrophy|oculomotor|nystagmus/i,
             label: 'In our graph: diseases sharing HPO eye phenotypes' } },
  { id: 'ep-develop', tier: 3, term: 'Developmental scores (Vineland / Bayley)', plain: 'standardized tests of what a child can do',
    what: 'Neurocognitive and developmental scales — critical for pediatric neurodegenerative diseases.',
    share: 'Already used in MPS III trials. A shared rater-training and norms effort would cut costs for every community here.',
    deriv: { kind: 'hpo', re: /developmental delay|developmental regression|intellectual disability|cognitive decline|cognitive impairment/i,
             label: 'In our graph: diseases sharing HPO developmental/cognitive phenotypes' } },
  { id: 'ep-breath', tier: 3, term: 'Breathing capacity (FVC)', plain: 'how much air the lungs can hold',
    what: 'Forced vital capacity — tracks respiratory decline, validated in Pompe.',
    share: 'Pompe respiratory protocols transfer to any LSD with respiratory involvement.',
    deriv: { kind: 'hpo', re: /respirat|pulmonary|dyspnea/i,
             label: 'In our graph: diseases sharing HPO respiratory phenotypes' } },
  { id: 'ep-organ', tier: 3, term: 'Organ size (spleen / liver)', plain: 'spleen and liver volume by scan',
    what: 'Enlarged spleen and liver are directly measurable signs of storage burden.',
    share: 'Simple, cheap, already standard — volumetry protocols are fully transferable.',
    deriv: { kind: 'hpo', re: /splenomegaly|hepatomegaly|hepatosplenomegaly/i,
             label: 'In our graph: diseases sharing HPO organ-enlargement phenotypes' } },

  { id: 'ep-brainmri', tier: 4, term: 'Brain MRI volumetrics', plain: 'brain scans measuring shrinkage and damage',
    what: 'Tracks neurodegeneration and white-matter damage over time.',
    share: 'Scan protocols and reading centers are expensive — sharing them across diseases multiplies their value.',
    deriv: { kind: 'hpo', re: /neurodegeneration|demyelination|leukodystrophy|brain atrophy|cerebral atrophy|white matter/i,
             label: 'In our graph: diseases sharing HPO brain-imaging phenotypes' } },
  { id: 'ep-heartmri', tier: 4, term: 'Heart imaging (cardiac MRI)', plain: 'heart scans for muscle thickening and scarring',
    what: 'Left-ventricular mass and fibrosis — the cardiac endpoints that matter in Fabry and Pompe.',
    share: 'Cardiac MRI protocols from Fabry trials transfer directly.',
    deriv: { kind: 'hpo', re: /cardiomyopathy|cardiac|ventricular hypertrophy|heart failure/i,
             label: 'In our graph: diseases sharing HPO cardiac phenotypes' } }
];

var EP_TIER_NAMES = {
  1: 'Tier 1 — Substrate & enzyme biomarkers',
  2: 'Tier 2 — Nerve-damage biomarkers (candidates)',
  3: 'Tier 3 — Functional endpoints (what patients can do)',
  4: 'Tier 4 — Imaging endpoints'
};

var EP_CAVEAT = 'Sharing a measurement is not sharing biology. A common endpoint lets trials share design, compare results, and split validation costs — it does not mean a treatment transfers between these diseases.';

/* ---------------- graph queries ---------------- */

function epFamilyOf(nodeId) {
  var n = nodesById[nodeId];
  if (!n || n.type !== 'disease') return null;
  var label = n.label || '';
  for (var i = 0; i < EP_FAMILIES.length; i++) {
    var f = EP_FAMILIES[i];
    if (f.re.test(label) && !(f.exclude && f.exclude.test(label))) return f.id;
  }
  return null;
}

function epFamilyDiseaseIds(fid) {
  var out = [];
  GRAPH.nodes.forEach(function (n) {
    if (n.type === 'disease' && epFamilyOf(n.id) === fid) out.push(n.id);
  });
  return out;
}

function epDiseaseGenes(did) {
  var out = [];
  GRAPH.edges.forEach(function (e) {
    if ((e.relation === 'associated_with_gene' || e.relation === 'caused_by_variant_in') && e.source === did) {
      var g = nodesById[e.target];
      if (g && g.type === 'gene') out.push(g.label);
    }
  });
  return out;
}

function epDiseasePhenotypes(did) {
  var out = [];
  GRAPH.edges.forEach(function (e) {
    if ((e.relation === 'has_phenotype' || e.relation === 'presents_with') && e.source === did) {
      var p = nodesById[e.target];
      if (p && p.type === 'phenotype') out.push(p.label);
    }
  });
  return out;
}

/* For each endpoint: which families qualify, and the graph evidence behind it. */
function epCompute() {
  // cache family -> {genes:Set, phenotypes:[labels]}
  var famData = {};
  EP_FAMILIES.forEach(function (f) {
    var genes = {}, phenos = [];
    epFamilyDiseaseIds(f.id).forEach(function (did) {
      epDiseaseGenes(did).forEach(function (gl) { genes[gl] = true; });
      epDiseasePhenotypes(did).forEach(function (pl) { if (phenos.indexOf(pl) < 0) phenos.push(pl); });
    });
    famData[f.id] = { genes: genes, phenos: phenos };
  });

  return ENDPOINTS.map(function (ep) {
    var fams = [], evidence = {};
    EP_FAMILIES.forEach(function (f) {
      var d = famData[f.id], hit = false, ev = [];
      if (ep.deriv.kind === 'gene') {
        var matched = ep.deriv.genes.filter(function (gl) { return d.genes[gl]; });
        if (matched.length) { hit = true; ev = matched.map(function (gl) { return 'gene ' + gl; }); }
      } else {
        var re = ep.deriv.kind === 'candidate' ? ep.deriv.hpo : ep.deriv.re;
        var matchedP = d.phenos.filter(function (pl) { return re.test(pl); });
        if (matchedP.length) { hit = true; ev = matchedP.slice(0, 4); }
      }
      if (hit) { fams.push(f.id); evidence[f.id] = ev; }
    });
    return { ep: ep, fams: fams, evidence: evidence };
  });
}

function epTrialsFor(famIds) {
  var dids = {};
  famIds.forEach(function (fid) { epFamilyDiseaseIds(fid).forEach(function (d) { dids[d] = true; }); });
  var out = [], seen = {};
  GRAPH.edges.forEach(function (e) {
    if (e.relation !== 'studied_in' || !dids[e.target] || seen[e.source]) return;
    var t = nodesById[e.source];
    if (t && t.type === 'trial') { seen[e.source] = true; out.push(t); }
  });
  return out;
}

function epOrgsFor(famIds) {
  var dids = {};
  famIds.forEach(function (fid) { epFamilyDiseaseIds(fid).forEach(function (d) { dids[d] = true; }); });
  var out = [], seen = {};
  GRAPH.edges.forEach(function (e) {
    if ((e.relation !== 'advocated_by') || !dids[e.source] || seen[e.target]) return;
    var o = nodesById[e.target];
    if (o && o.type === 'patient_org') { seen[e.target] = true; out.push(o); }
  });
  return out.slice(0, 4);
}

function epResearchersFor(famIds) {
  var dids = {};
  famIds.forEach(function (fid) { epFamilyDiseaseIds(fid).forEach(function (d) { dids[d] = true; }); });
  var out = [], seen = {};
  GRAPH.edges.forEach(function (e) {
    if (e.relation !== 'investigates' || !dids[e.target] || seen[e.source]) return;
    var r = nodesById[e.source];
    if (r && r.type === 'researcher') { seen[e.source] = true; out.push(r); }
  });
  return out.slice(0, 4);
}

function epFamName(fid) {
  var f = EP_FAMILIES.filter(function (x) { return x.id === fid; })[0];
  return f ? f.name : fid;
}

/* ---------------- rendering ---------------- */

function epTierBadge(tier) {
  var cls = tier === 2 ? 'warn' : '';
  return '<span class="badge ' + cls + '">Tier ' + tier + (tier === 2 ? ' · candidate' : '') + '</span>';
}

function epCard(row) {
  var ep = row.ep, fams = row.fams;
  var trials = epTrialsFor(fams);
  var orgs = epOrgsFor(fams);
  var researchers = epResearchersFor(fams);
  var famChips = fams.map(function (fid) {
    var ev = (row.evidence[fid] || []).slice(0, 3).join('; ');
    return '<span class="ep-chip" title="' + esc(ev) + '">' + esc(epFamName(fid)) + '</span>';
  }).join(' ');

  var html = '<div class="card ep-card">';
  html += '<h2>' + esc(ep.term) + '</h2>';
  html += '<div class="count">' + esc(ep.plain) + '</div>';
  html += '<div style="margin:6px 0">' + epTierBadge(ep.tier) + ' <span class="ep-deriv">' + esc(ep.deriv.label) + '</span></div>';
  html += '<p>' + esc(ep.what) + '</p>';
  html += '<div class="kv-line"><strong>Measured in ' + fams.length + ' disease group' + (fams.length === 1 ? '' : 's') + ':</strong></div>';
  html += '<div class="ep-chips">' + (famChips || '<span class="wi-unknown">No diseases in our graph match this endpoint yet.</span>') + '</div>';
  html += '<p><strong>Why sharing matters:</strong> ' + esc(ep.share) + '</p>';
  if (ep.caveat) html += '<p class="ep-caveat"><strong>Caution:</strong> ' + esc(ep.caveat) + '</p>';
  if (trials.length) {
    html += '<div class="kv-line"><strong>' + trials.length + ' trial' + (trials.length === 1 ? '' : 's') + ' in these diseases:</strong> ';
    html += trials.slice(0, 4).map(function (t) {
      var url = t.extra && t.extra.url;
      var label = (t.extra && t.extra.nct) || shortLabel(t.label, 40);
      return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + '</a>' : esc(label);
    }).join(', ') + (trials.length > 4 ? '…' : '') + '</div>';
    html += '<div class="wi-sub">We did not parse which endpoints each trial used — these are trials in the same diseases.</div>';
  }
  var contacts = [];
  orgs.forEach(function (o) { contacts.push(esc(o.label)); });
  researchers.forEach(function (r) { contacts.push(esc(r.label)); });
  if (contacts.length) {
    html += '<div class="kv-line"><strong>Who to talk to about sharing this measurement:</strong> ' + contacts.join('; ') + '</div>';
  } else {
    html += '<div class="wi-sub">No linked organizations or researchers in our graph for these diseases yet.</div>';
  }
  html += '</div>';
  return html;
}

function epMatrix(rows) {
  // rows: computed endpoints with >=2 families, sorted by family count desc
  var use = rows.filter(function (r) { return r.fams.length >= 2; })
                .sort(function (a, b) { return b.fams.length - a.fams.length; })
                .slice(0, 14);
  if (!use.length) return '';
  var html = '<h2>Sharing matrix</h2><p>Which disease groups can be measured the same way. Hover a check for the graph evidence behind it.</p>';
  html += '<div class="ep-matrix-wrap"><table class="ep-matrix"><thead><tr><th>Endpoint</th>';
  EP_FAMILIES.forEach(function (f) { html += '<th title="' + esc(f.name) + '">' + esc(f.name.split(' ')[0]) + '</th>'; });
  html += '</tr></thead><tbody>';
  use.forEach(function (row) {
    html += '<tr><td>' + esc(row.ep.term) + '</td>';
    EP_FAMILIES.forEach(function (f) {
      var on = row.fams.indexOf(f.id) >= 0;
      var title = on ? esc((row.evidence[f.id] || []).join('; ')) : '';
      html += '<td class="' + (on ? 'on' : '') + '" title="' + title + '">' + (on ? '✓' : '·') + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function epDiseasePicker(rows) {
  var html = '<h2>Pick a disease</h2><p>Everything measurable about one disease — and who else measures the same things.</p>';
  html += '<select id="epPick" class="ep-pick">';
  html += '<option value="">— choose a disease group —</option>';
  EP_FAMILIES.forEach(function (f) { html += '<option value="' + f.id + '">' + esc(f.name) + '</option>'; });
  html += '</select><div id="epPickOut" style="margin-top:1rem"></div>';
  return html;
}

function epRenderPick(fid, rows) {
  var out = document.getElementById('epPickOut');
  if (!fid) { out.innerHTML = ''; return; }
  var mine = rows.filter(function (r) { return r.fams.indexOf(fid) >= 0; });
  var html = '<h3>' + esc(epFamName(fid)) + ' — measurable ' + mine.length + ' way' + (mine.length === 1 ? '' : 's') + '</h3>';
  if (!mine.length) {
    out.innerHTML = html + '<p class="wi-unknown">No endpoints in our catalog match this disease group in the current graph.</p>';
    return;
  }
  mine.forEach(function (row) {
    var others = row.fams.filter(function (x) { return x !== fid; }).map(epFamName);
    html += '<div class="wi-item"><strong>' + esc(row.ep.term) + '</strong> <span class="wi-sub">(' + esc(row.ep.plain) + ')</span><br>';
    html += '<span class="wi-sub">' + esc(row.ep.deriv.label) + '</span><br>';
    html += others.length
      ? '<span>Also measured in: <strong>' + esc(others.join(', ')) + '</strong> — a shared protocol conversation starts here.</span>'
      : '<span class="wi-sub">No other disease group in our graph shares this measurement yet.</span>';
    html += '</div>';
  });
  out.innerHTML = html;
}

function initEndpoints() {
  var body = document.getElementById('endpointsBody');
  if (!body || body.dataset.done) return;
  body.dataset.done = '1';

  var rows;
  try {
    rows = epCompute();
  } catch (err) {
    body.innerHTML = '<p class="wi-unknown">Could not compute endpoint sharing from the graph: ' + esc(String(err && err.message || err)) + '</p>';
    return;
  }

  var html = '<div class="ep-caveat-banner"><strong>Read this first:</strong> ' + esc(EP_CAVEAT) + '</div>';
  html += '<p class="wi-note">Endpoint <em>definitions</em> below are curated from clinical knowledge (labeled per card). ' +
          'Every <em>disease link</em> is computed live from this atlas\u2019s graph — hover any disease chip or matrix check to see the exact graph evidence. ' +
          'Where our sources don\u2019t assert something, the card says so.</p>';

  html += epDiseasePicker(rows);
  html += epMatrix(rows);

  [1, 2, 3, 4].forEach(function (tier) {
    var tierRows = rows.filter(function (r) { return r.ep.tier === tier && r.fams.length > 0; });
    html += '<h2 style="margin-top:1.6rem">' + esc(EP_TIER_NAMES[tier]) + '</h2>';
    if (!tierRows.length) {
      html += '<p class="wi-unknown">No disease groups in the current graph match this tier.</p>';
      return;
    }
    html += '<div class="cards">' + tierRows.map(epCard).join('') + '</div>';
  });

  var empty = rows.filter(function (r) { return r.fams.length === 0; });
  if (empty.length) {
    html += '<h2 style="margin-top:1.6rem">Not yet matched in our graph</h2><p class="wi-sub">' +
      empty.map(function (r) { return esc(r.ep.term); }).join(', ') +
      ' — defined in the catalog but no disease group in the current graph matched. This is a data gap, not a negative result.</p>';
  }

  body.innerHTML = html;
  document.getElementById('epPick').addEventListener('change', function (e) {
    epRenderPick(e.target.value, rows);
  });
}

function endpointsBoot() {
  if (!window.__atlasReady || typeof GRAPH === 'undefined' || !GRAPH) { setTimeout(endpointsBoot, 250); return; }
  initEndpoints();
}
endpointsBoot();
