/* AI Atlas — "What If" Scenario Planner (whatif.js).
 * Lets a visitor model hypothetical research strategies for THEIR disease:
 * pick a disease, then see what a natural-history study or a newborn-screening
 * push would build on — real graph resources, all clickable into Explore.
 * Loads after app.js/views.js; uses their globals (GRAPH, nodesById, esc,
 * displayName, linkifyRef, shortLabel).
 * RULE: never invent facts. Everything shown comes from GRAPH or is
 * explicitly labeled illustrative / unknown.
 */
'use strict';

var WHATIF_KEY = 'atlas_whatif_active'; // localStorage: 'A' | 'B' | 'both' | null
var wiMode = 'A';
var wiDiseaseId = null;

function whatifBoot() {
  if (!window.__atlasReady || typeof GRAPH === 'undefined' || !GRAPH) { setTimeout(whatifBoot, 250); return; }
  initWhatIf();
}
whatifBoot();

/* ---------------- data queries (runtime, from GRAPH) ---------------- */

function wiNodes(type) {
  return GRAPH.nodes.filter(function (n) { return n.type === type; });
}
function wiBlob(n) {
  if (!n) return '';
  return ((n.label || '') + ' ' + (n.description || '')).toLowerCase();
}
function wiDiseases() {
  return wiNodes('disease').sort(function (a, b) {
    return displayName(a).localeCompare(displayName(b));
  });
}
function wiDefaultDisease() {
  try {
    var d = window.__atlas && window.__atlas.getDisease && window.__atlas.getDisease();
    if (d && nodesById[d] && nodesById[d].type === 'disease') return d;
  } catch (e) {}
  var ds = wiDiseases();
  return ds.length ? ds[0].id : null;
}
function wiDisease() {
  if (wiDiseaseId && nodesById[wiDiseaseId]) return nodesById[wiDiseaseId];
  wiDiseaseId = wiDefaultDisease();
  return nodesById[wiDiseaseId] || null;
}
function wiDiseaseName() {
  var d = wiDisease();
  return d ? displayName(d) : 'this disease';
}
function wiGrantsFor(rid) {
  var out = [];
  GRAPH.edges.forEach(function (e) {
    if (e.relation === 'funds' && e.target === rid && nodesById[e.source] && nodesById[e.source].type === 'funding') {
      out.push(nodesById[e.source]);
    }
  });
  return out;
}
function wiResearchersByGrant(re) {
  return wiNodes('researcher').filter(function (r) {
    return wiGrantsFor(r.id).some(function (g) { return re.test(wiBlob(g)); });
  });
}
function wiResearchersForDisease(did) {
  var out = [], seen = {};
  GRAPH.edges.forEach(function (e) {
    if (e.relation !== 'investigates' || e.target !== did || seen[e.source]) return;
    var r = nodesById[e.source];
    if (r && r.type === 'researcher') { seen[e.source] = true; out.push(r); }
  });
  return out;
}
function wiTrialsForDisease(did, onlyRecruiting) {
  var out = [], seen = {};
  GRAPH.edges.forEach(function (e) {
    if (e.relation !== 'studied_in' || e.target !== did || seen[e.source]) return;
    var t = nodesById[e.source];
    if (!t || t.type !== 'trial') return;
    if (onlyRecruiting && !(t.extra && t.extra.status === 'RECRUITING')) return;
    seen[e.source] = true; out.push(t);
  });
  return out;
}
function wiOrgsForDisease(did) {
  var out = [], seen = {};
  GRAPH.edges.forEach(function (e) {
    if (e.relation !== 'advocated_by' || e.source !== did || seen[e.target]) return;
    var o = nodesById[e.target];
    if (o && o.type === 'patient_org') { seen[e.target] = true; out.push(o); }
  });
  return out;
}
function wiTenX() {
  return (GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.ten_x) || null;
}
function wiIsSanfilippoA() {
  var d = wiDisease();
  return d && /mucopolysaccharidosis type 3a/i.test(d.label || '');
}
function wiRef(ref) {
  if (!ref) return '';
  var link = linkifyRef(ref);
  if (link) return ' <a href="' + esc(link.url) + '" target="_blank" rel="noopener">' + esc(link.label) + ' &rarr;</a>';
  return ' <span class="ref">' + esc(ref) + '</span>';
}

/* Every named thing links into Explore, centered on that node. */
function wiNodeLink(id, text) {
  var n = nodesById[id];
  if (!n) return esc(text || '');
  return '<a href="#" class="wi-node-link" data-wi-node="' + esc(id) + '">' + esc(text || displayName(n)) + '</a>';
}

/* ---------------- shared render helpers ---------------- */

function wiResearcherCard(r) {
  var grants = wiGrantsFor(r.id);
  var html = '<div class="wi-person"><strong>' + wiNodeLink(r.id, r.label) + '</strong>';
  if (r.description) html += '<div class="wi-sub">' + esc(r.description) + '</div>';
  grants.slice(0, 2).forEach(function (g) {
    html += '<div class="wi-sub">Grant: ' + esc((g.label || '').slice(0, 90)) + '</div>';
  });
  var pmid = r.extra && r.extra.pmid;
  if (pmid) html += '<div class="wi-sub">Paper: ' + wiRef('PMID:' + pmid) + '</div>';
  html += '<div class="wi-contact-note">Contact path: unknown &mdash; not in our sources. Ask the patient orgs below for an introduction.</div></div>';
  return html;
}

function wiAssetLine(a) {
  return '<div class="wi-item"><strong>' + wiNodeLink(a.id, a.label) + '</strong>' +
    (a.description ? '<div class="wi-sub">' + esc(a.description.slice(0, 220)) + '</div>' : '') + '</div>';
}

function wiOrgLine(o) {
  return '<div class="wi-item"><strong>' + wiNodeLink(o.id, o.label) + '</strong>' +
    (o.description ? '<div class="wi-sub">' + esc(o.description.slice(0, 200)) + '</div>' : '') + '</div>';
}

function wiTrialLine(t) {
  var nct = (t.extra && t.extra.nct) || t.id;
  return '<div class="wi-item"><strong>' + wiNodeLink(t.id, shortLabel(t, 70)) + '</strong>' +
    '<div class="wi-sub">' + esc(t.description ? t.description.slice(0, 160) : '') + '</div>' +
    '<div class="wi-sub">' + wiRef(nct.match(/^NCT/) ? nct : null) + '</div></div>';
}

function wiActive() {
  try { return localStorage.getItem(WHATIF_KEY); } catch (e) { return null; }
}
function wiSetActive(v) {
  var allowed = ['A', 'B', 'both', null];
  if (allowed.indexOf(v) === -1) return;
  try {
    if (v === null) localStorage.removeItem(WHATIF_KEY);
    else localStorage.setItem(WHATIF_KEY, v);
  } catch (e) {}
  renderWhatIf();
}

/* ---------------- scenario builders ---------------- */

function wiScenarioA() {
  var d = wiDisease(), did = d ? d.id : null, dname = wiDiseaseName();
  // Natural-history study for the selected disease — real graph data only.
  var nhAssets = wiNodes('asset').filter(function (a) {
    return /natural.history|natural-history/.test(wiBlob(a)) && !/registry|iamrare/.test(wiBlob(a));
  });
  var registries = wiNodes('asset').filter(function (a) {
    return /registry|iamrare/.test(wiBlob(a));
  });
  var grantResearchers = wiResearchersByGrant(/follow.?up|outcome assessment|natural history|longitudinal/i);
  var diseaseResearchers = did ? wiResearchersForDisease(did) : [];
  var recruiting = did ? wiTrialsForDisease(did, true) : [];
  var allTrials = did ? wiTrialsForDisease(did, false) : [];
  var orgs = did ? wiOrgsForDisease(did) : [];
  var tx = wiTenX();
  var isMPS3A = wiIsSanfilippoA();

  var html = '<div class="wi-scenario">';
  html += '<h3 class="wi-title">Scenario A &mdash; Launch a natural-history study for ' + esc(dname) + '</h3>';
  html += '<p class="section-lede">If you pursue this path, here is what exists to build on &mdash; all from the atlas graph. Click any name to inspect it in Explore.</p>';

  html += '<h4>Study designs you can reuse</h4>';
  if (nhAssets.length) nhAssets.forEach(function (a) { html += wiAssetLine(a); });
  else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';
  if (registries.length) {
    html += '<h4>Registries already collecting patients</h4>';
    registries.forEach(function (a) { html += wiAssetLine(a); });
  }

  html += '<h4>Researchers already working on ' + esc(dname) + '</h4>';
  if (diseaseResearchers.length) diseaseResearchers.slice(0, 6).forEach(function (r) { html += wiResearcherCard(r); });
  else html += '<p class="wi-unknown">No researchers in our graph are linked to this disease yet.</p>';
  html += '<h4>Researchers with natural-history grant experience (any disease)</h4>';
  if (grantResearchers.length) grantResearchers.slice(0, 6).forEach(function (r) { html += wiResearcherCard(r); });
  else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Estimated timeline</h4>';
  if (isMPS3A && tx) {
    html += '<p>Based on the modeled 10&times; case in this atlas: <strong>' + tx.baseline_years +
      ' years siloed &rarr; ' + tx.proposed_years + ' years shared</strong>. ' +
      'Biology cannot be compressed &mdash; follow-up still takes ~1 year &mdash; but design, recruitment, and analysis reuse the MPS I/II template. ' +
      'See the 10&times; Impact tab for the full phase breakdown and stated assumptions.</p>';
  } else {
    html += '<p class="wi-unknown">Not modeled for ' + esc(dname) + ' &mdash; the 10&times; timeline model in this atlas covers Sanfilippo A only.</p>';
  }

  html += '<h4>Trials that need natural-history comparators</h4>';
  html += '<p><strong>' + recruiting.length + '</strong> recruiting trial' + (recruiting.length === 1 ? '' : 's') +
    ' study ' + esc(dname) + ' directly' + (allTrials.length ? ' (' + allTrials.length + ' total in our graph)' : '') + ':</p>';
  if (recruiting.length) recruiting.slice(0, 4).forEach(function (t) { html += wiTrialLine(t); });
  else html += '<p class="wi-unknown">None currently recruiting in our graph for this disease.</p>';
  if (isMPS3A) {
    html += '<p class="wi-note">Fayuvi&rsquo;s FDA approval rested on a single-arm study vs an external natural-history control &mdash; ' +
      'your study&rsquo;s data could serve future trials the same way.</p>';
  }

  html += '<h4>Gaps to fill</h4><ul class="assume-list">';
  html += '<li>Disease-specific <strong>endpoints still need validation</strong> &mdash; a borrowed study design covers structure, not the measurements that prove a treatment worked for <em>this</em> disease.</li>';
  html += '<li>Participant-level data access, sponsor permission, consent, and governance for reusing another design remain to be established.</li>';
  html += '<li>An available investigator team, engaged patient group, and funding are assumed &mdash; none are in hand yet.</li></ul>';

  html += '<h4>Patient-org allies</h4>';
  if (orgs.length) orgs.forEach(function (o) { html += wiOrgLine(o); });
  else html += '<p class="wi-unknown">No patient organizations in our graph are linked to ' + esc(dname) + ' yet.</p>';

  html += wiActiveButton('A');
  html += '</div>';
  return html;
}

function wiScenarioB() {
  // Newborn-screening advocacy for the selected disease.
  var d = wiDisease(), did = d ? d.id : null, dname = wiDiseaseName();
  var screenGrants = wiNodes('funding').filter(function (f) { return /newborn screening/.test(wiBlob(f)); });
  var screenTrials = wiNodes('trial').filter(function (t) { return /newborn screening/.test(wiBlob(t)); });
  var researchers = wiResearchersByGrant(/screening/i);
  var orgs = did ? wiOrgsForDisease(did) : [];
  var isMPS3A = wiIsSanfilippoA();

  var html = '<div class="wi-scenario">';
  html += '<h3 class="wi-title">Scenario B &mdash; Advocate for newborn-screening inclusion for ' + esc(dname) + '</h3>';
  html += '<p class="section-lede">If you pursue this path, here is the landscape &mdash; all from the atlas graph unless labeled otherwise. Click any name to inspect it in Explore.</p>';

  html += '<h4>Screening work already funded</h4>';
  screenGrants.forEach(function (f) {
    html += '<div class="wi-item"><strong>' + wiNodeLink(f.id, (f.label || '').slice(0, 95)) + '</strong>' +
      '<div class="wi-sub">' + esc((f.description || '').slice(0, 200)) + '</div></div>';
  });
  screenTrials.forEach(function (t) { html += wiTrialLine(t); });
  if (!screenGrants.length && !screenTrials.length) html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Potential collaborators</h4>';
  if (researchers.length) researchers.slice(0, 6).forEach(function (r) { html += wiResearcherCard(r); });
  else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Precedent pathway</h4>';
  html += '<p class="wi-note">From another disease community, as a playbook reference &mdash; not a claim about ' + esc(dname) + ':</p>';
  var mpsSociety = wiNodes('patient_org').filter(function (o) { return o.label === 'National MPS Society'; })[0];
  if (mpsSociety && mpsSociety.description) {
    html += '<p>' + esc(mpsSociety.description) + ' &mdash; the National MPS Society&rsquo;s own record in this atlas. ' +
      'MPS I shows that screening inclusion is achievable for this disease family; the advocacy playbook exists.</p>';
  } else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Evidence screening panels generally require</h4>';
  html += '<p class="wi-note">General process knowledge &mdash; not from our graph:</p><ul class="assume-list">';
  html += '<li>A validated assay for the condition.</li>';
  html += '<li>Clear benefit from early intervention.</li>';
  html += '<li>Cost-effectiveness data.</li></ul>';

  html += '<h4>Current gaps</h4><ul class="assume-list">';
  if (isMPS3A) {
    html += '<li><strong>Early-intervention benefit is the primary barrier.</strong> Fayuvi is approved for MPS IIIA but on a narrow pediatric label ' +
      '(preserved neurodevelopmental function) &mdash; many screen-detected children would fall outside it. Label expansion needs presymptomatic data.</li>';
  } else {
    html += '<li><strong>Early-intervention benefit is usually the primary barrier.</strong> Panels need proof that catching ' +
      esc(dname) + ' at birth changes outcomes &mdash; that means an approved early treatment or presymptomatic trial data.</li>';
  }
  html += '<li>Presymptomatic trial targeting: unknown &mdash; check individual trial records; our graph does not structure this field.</li></ul>';

  html += '<h4>Patient-org allies</h4>';
  if (orgs.length) orgs.forEach(function (o) { html += wiOrgLine(o); });
  else html += '<p class="wi-unknown">No patient organizations in our graph are linked to ' + esc(dname) + ' yet.</p>';

  html += wiActiveButton('B');
  html += '</div>';
  return html;
}

function wiBoth() {
  var dname = wiDiseaseName();
  var poolA = wiResearchersByGrant(/follow.?up|outcome assessment|natural history|longitudinal/i);
  var poolB = wiResearchersByGrant(/screening/i);
  var idsA = {}, idsB = {};
  poolA.forEach(function (r) { idsA[r.id] = true; });
  poolB.forEach(function (r) { idsB[r.id] = true; });
  var direct = poolA.filter(function (r) { return idsB[r.id]; });

  var html = '<div class="wi-scenario">';
  html += '<h3 class="wi-title">Both &mdash; run the strategies together for ' + esc(dname) + '</h3>';
  html += '<p class="section-lede">Where the two paths reinforce each other.</p>';

  html += '<h4>Researchers appearing in both scenarios</h4>';
  if (direct.length) direct.slice(0, 6).forEach(function (r) { html += wiResearcherCard(r); });
  else html += '<p class="wi-unknown">No single researcher in our data holds grants in both areas &mdash; the overlap runs through shared diseases instead.</p>';

  html += '<h4>How natural history strengthens a screening application</h4>';
  html += '<p>Screening panels require evidence of <strong>benefit from early intervention</strong>. ' +
    'A natural-history study documents exactly what &ldquo;early&rdquo; changes: the untreated trajectory your intervention must beat. ' +
    'Build the study first; the screening case inherits its evidence.</p>';

  html += '<h4>Side-by-side comparison</h4>';
  html += '<table class="compare-table"><caption class="sr-only">Scenario comparison for ' + esc(dname) + '</caption><thead><tr><th scope="col"></th><th scope="col">Scenario A: Natural-history study</th><th scope="col">Scenario B: Screening advocacy</th></tr></thead><tbody>';
  html += '<tr><td><strong>Core question</strong></td><td>What does untreated ' + esc(dname) + ' look like, precisely?</td><td>Should every newborn be tested for ' + esc(dname) + '?</td></tr>';
  html += '<tr><td><strong>Modeled timeline</strong></td><td>' + (wiIsSanfilippoA() ? '~2.2 yrs shared (see 10&times; Impact tab)' : '<span class="wi-unknown">not modeled for this disease</span>') + '</td><td class="wi-unknown">unknown &mdash; not in our sources</td></tr>';
  html += '<tr><td><strong>Key reusable asset</strong></td><td>Shared natural-history study designs and registries above</td><td>Screening-advocacy precedent from other disease communities</td></tr>';
  html += '<tr><td><strong>Biggest gap</strong></td><td>Validated disease-specific endpoints</td><td>Proof that early detection changes outcomes</td></tr>';
  html += '<tr><td><strong>Who it convinces</strong></td><td>Trial sponsors, regulators (external controls)</td><td>State screening panels, payers</td></tr>';
  html += '</tbody></table>';

  html += wiActiveButton('both');
  html += '</div>';
  return html;
}

function wiActiveButton(scn) {
  var active = wiActive();
  var label = scn === 'both' ? 'both scenarios' : 'Scenario ' + scn;
  if (active === scn) {
    return '<p class="wi-active-note">&#10003; Marked <strong>active</strong> &mdash; saved on this device only.</p>';
  }
  return '<button class="btn" data-wi-active="' + scn + '">Mark ' + esc(label) + ' as active</button>' +
    '<p class="wi-note">Saved on this device only.</p>';
}

/* ---------------- main render ---------------- */

function wiDiseasePicker() {
  var ds = wiDiseases();
  var cur = wiDiseaseId || wiDefaultDisease();
  var html = '<div class="wi-disease-row"><label for="wiDisease"><strong>Disease:</strong></label> ' +
    '<select id="wiDisease" class="ep-pick" aria-label="Choose a disease for the scenarios">';
  ds.forEach(function (d) {
    html += '<option value="' + esc(d.id) + '"' + (d.id === cur ? ' selected' : '') + '>' + esc(displayName(d)) + '</option>';
  });
  html += '</select></div>';
  return html;
}

function renderWhatIf() {
  var body = document.getElementById('whatifBody');
  if (!body || typeof GRAPH === 'undefined' || !GRAPH) return;
  if (!wiDiseaseId) wiDiseaseId = wiDefaultDisease();
  var active = wiActive();
  var html = '<p class="section-lede">A flight simulator for strategy. Pick your disease, then model what each path would give you &mdash; ' +
    'resources, collaborators, timelines &mdash; before spending two years on it. Everything below comes from the atlas graph unless labeled. ' +
    'Click any name to inspect it in the Explore graph.</p>';

  html += wiDiseasePicker();

  html += '<div class="seg" role="radiogroup" aria-label="Scenario">';
  html += '<button class="seg-btn' + (wiMode === 'A' ? ' active' : '') + '" data-wi-mode="A" role="radio" aria-checked="' + (wiMode === 'A' ? 'true' : 'false') + '">Scenario A: Natural-history study</button>';
  html += '<button class="seg-btn' + (wiMode === 'B' ? ' active' : '') + '" data-wi-mode="B" role="radio" aria-checked="' + (wiMode === 'B' ? 'true' : 'false') + '">Scenario B: Screening advocacy</button>';
  html += '<button class="seg-btn' + (wiMode === 'both' ? ' active' : '') + '" data-wi-mode="both" role="radio" aria-checked="' + (wiMode === 'both' ? 'true' : 'false') + '">Both</button>';
  html += '</div>';

  if (wiMode === 'A') html += wiScenarioA();
  else if (wiMode === 'B') html += wiScenarioB();
  else html += wiBoth();

  html += '<div class="wi-export"><button class="btn" id="wiExport">Export comparison (print)</button>' +
    (active ? '<span class="wi-note">Active: ' + esc(active === 'both' ? 'both scenarios' : 'Scenario ' + active.toUpperCase()) + '</span>' : '') + '</div>';

  html += '<div class="tech-detail"><h3>Model assumptions and parameters</h3><p>This is a planning scenario, not a prediction of clinical benefit. Counts use recorded graph connections; shared biology does not establish treatment transfer. Investigator availability, funding, and patient participation are assumed, not confirmed. Recruitment status is a snapshot that must be checked with trial teams.</p></div>';
  body.innerHTML = html;

  var sel = document.getElementById('wiDisease');
  if (sel) sel.addEventListener('change', function () {
    wiDiseaseId = sel.value;
    renderWhatIf();
  });
  body.querySelectorAll('[data-wi-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      wiMode = b.dataset.wiMode;
      renderWhatIf();
      var nb = document.querySelector('[data-wi-mode="' + wiMode + '"]');
      if (nb) nb.focus();
    });
  });
  body.querySelectorAll('[data-wi-active]').forEach(function (b) {
    b.addEventListener('click', function () { wiSetActive(b.dataset.wiActive); });
  });
  /* Clicking any named resource jumps to it in the Explore graph.
   * (center is set after switchTab: switching tabs re-centers on the shared
   * disease, so the order matters.) */
  body.querySelectorAll('[data-wi-node]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      var id = a.getAttribute('data-wi-node');
      if (window.__atlas && nodesById[id]) {
        window.__atlas.switchTab('explore');
        window.__atlas.state.center = id;
        window.__atlas.state.hops = 1;
        window.__atlas.renderExplore();
      }
    });
  });
  var exp = document.getElementById('wiExport');
  if (exp) exp.addEventListener('click', function () { window.print(); });
}

function initWhatIf() {
  renderWhatIf();
  if (typeof markTerms === 'function') {
    var b = document.getElementById('whatifBody');
    if (b) markTerms(b);
  }
}
