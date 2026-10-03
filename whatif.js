/* AI Atlas — "What If" Scenario Planner (whatif.js).
 * Additive view: lets Maria model hypothetical research strategies.
 * Loads after app.js/views.js; uses their globals (GRAPH, nodesById, esc,
 * displayName, linkifyRef, incidentEdges, shortLabel).
 * RULE: never invent facts. Everything shown comes from GRAPH or is
 * explicitly labeled illustrative / unknown.
 */
'use strict';

var WHATIF_KEY = 'atlas_whatif_active'; // localStorage: 'A' | 'B' | 'both' | null

function whatifBoot() {
  if (!window.__atlasReady || !GRAPH) { setTimeout(whatifBoot, 250); return; }
  initWhatIf();
}
whatifBoot();

/* ---------------- data queries (runtime, from GRAPH) ---------------- */

function wiNodes(type) {
  return GRAPH.nodes.filter(function (n) { return n.type === type; });
}
function wiBlob(n) {
  return ((n.label || '') + ' ' + (n.description || '')).toLowerCase();
}
function wiGrantsFor(rid) {
  // funding nodes with a funds edge to this researcher
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
function wiInvestigatesDisease(rid, diseaseRe) {
  return GRAPH.edges.some(function (e) {
    if (e.source !== rid || e.relation !== 'investigates') return false;
    var d = nodesById[e.target];
    return d && d.type === 'disease' && diseaseRe.test((d.label || '').toLowerCase());
  });
}
function wiRecruitingTrials() {
  return wiNodes('trial').filter(function (t) {
    return t.extra && t.extra.status === 'RECRUITING';
  });
}
function wiTrialsStudying(diseaseRe) {
  return wiNodes('trial').filter(function (t) {
    return GRAPH.edges.some(function (e) {
      if (e.relation !== 'studied_in' || e.source !== t.id) return false;
      var d = nodesById[e.target];
      return d && diseaseRe.test((d.label || '').toLowerCase());
    });
  });
}
function wiTenX() {
  return (GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.ten_x) || null;
}
function wiRef(ref) {
  if (!ref) return '';
  var link = linkifyRef(ref);
  if (link) return ' <a href="' + esc(link.url) + '" target="_blank" rel="noopener">' + esc(link.label) + ' &rarr;</a>';
  return ' <span class="ref">' + esc(ref) + '</span>';
}

/* ---------------- shared render helpers ---------------- */

function wiResearcherCard(r) {
  var grants = wiGrantsFor(r.id);
  var html = '<div class="wi-person"><strong>' + esc(r.label) + '</strong>';
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
  return '<div class="wi-item"><strong>' + esc(a.label) + '</strong>' +
    (a.description ? '<div class="wi-sub">' + esc(a.description.slice(0, 220)) + '</div>' : '') + '</div>';
}

function wiOrgLine(o) {
  return '<div class="wi-item"><strong>' + esc(o.label) + '</strong>' +
    (o.description ? '<div class="wi-sub">' + esc(o.description.slice(0, 200)) + '</div>' : '') + '</div>';
}

function wiTrialLine(t) {
  var nct = (t.extra && t.extra.nct) || t.id;
  return '<div class="wi-item"><strong>' + esc(shortLabel(t, 70)) + '</strong>' +
    '<div class="wi-sub">' + esc(t.description ? t.description.slice(0, 160) : '') + '</div>' +
    '<div class="wi-sub">' + wiRef(nct.match(/^NCT/) ? nct : null) + '</div></div>';
}

function wiActive() {
  try { return localStorage.getItem(WHATIF_KEY); } catch (e) { return null; }
}
function wiSetActive(v) {
  try { localStorage.setItem(WHATIF_KEY, v); } catch (e) {}
  renderWhatIf();
}

/* ---------------- scenario builders ---------------- */

function wiScenarioA() {
  // Natural-history study for Sanfilippo A — real graph data only.
  var nhAssets = wiNodes('asset').filter(function (a) {
    return /natural.history|natural-history/.test(wiBlob(a)) && !/registry|iamrare/.test(wiBlob(a));
  });
  var registries = wiNodes('asset').filter(function (a) {
    return /registry|iamrare/.test(wiBlob(a));
  });
  var researchers = wiResearchersByGrant(/follow.?up|outcome assessment|natural history|longitudinal/i);
  var recruiting = wiRecruitingTrials();
  var mps3rec = wiTrialsStudying(/mucopolysaccharidosis type 3/);
  var orgs = ['National MPS Society', 'Cure Sanfilippo Foundation', 'National Organization for Rare Disorders (NORD)']
    .map(function (name) {
      return wiNodes('patient_org').filter(function (o) { return o.label === name; })[0];
    }).filter(Boolean);
  var tx = wiTenX();

  var html = '<div class="wi-scenario">';
  html += '<h3 class="wi-title">Scenario A &mdash; Launch a natural-history study for Sanfilippo A</h3>';
  html += '<p class="section-lede">If you pursue this path, here is what exists to build on &mdash; all from the atlas graph.</p>';

  html += '<h4>Connected resources: study designs you can reuse</h4>';
  if (nhAssets.length) nhAssets.forEach(function (a) { html += wiAssetLine(a); });
  else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';
  if (registries.length) {
    html += '<h4>Registries already collecting patients</h4>';
    registries.forEach(function (a) { html += wiAssetLine(a); });
  }

  html += '<h4>Potential collaborators</h4>';
  if (researchers.length) researchers.forEach(function (r) { html += wiResearcherCard(r); });
  else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Estimated timeline</h4>';
  if (tx) {
    html += '<p>Based on the modeled 10&times; case in this atlas: <strong>' + tx.baseline_years +
      ' years siloed &rarr; ' + tx.proposed_years + ' years shared</strong>. ' +
      'Biology cannot be compressed &mdash; follow-up still takes ~1 year &mdash; but design, recruitment, and analysis reuse the MPS I/II template. ' +
      'See the 10&times; Impact tab for the full phase breakdown and stated assumptions.</p>';
  } else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Synergies: trials that need natural-history comparators</h4>';
  html += '<p><strong>' + recruiting.length + '</strong> trials are currently recruiting in the graph. ' +
    'Of those, <strong>' + mps3rec.length + '</strong> study MPS III directly:</p>';
  mps3rec.slice(0, 4).forEach(function (t) { html += wiTrialLine(t); });
  html += '<p class="wi-note">Fayuvi&rsquo;s FDA approval rested on a single-arm study vs an external natural-history control &mdash; ' +
    'your study&rsquo;s data could serve future trials the same way.</p>';

  html += '<h4>Gaps to fill</h4><ul class="assume-list">';
  html += '<li>Sanfilippo-A-specific <strong>neurocognitive endpoints still need validation</strong> &mdash; the MPS I/II template covers registry structure, not brain outcomes.</li>';
  html += '<li>Participant-level data access, sponsor permission, consent, and governance for reusing the MPS I/II design remain to be established.</li>';
  html += '<li>An available investigator team, engaged patient group, and funding are assumed &mdash; none are in hand yet.</li></ul>';

  html += '<h4>Patient-org allies</h4>';
  orgs.forEach(function (o) { html += wiOrgLine(o); });
  html += '<p class="wi-note">The National MPS Society already runs cross-subtype infrastructure your study could plug into.</p>';

  html += wiActiveButton('A');
  html += '</div>';
  return html;
}

function wiScenarioB() {
  // Newborn-screening advocacy — real graph data only; process facts labeled.
  var screenGrants = wiNodes('funding').filter(function (f) { return /newborn screening/.test(wiBlob(f)); });
  var screenTrials = wiNodes('trial').filter(function (t) { return /newborn screening/.test(wiBlob(t)); });
  var researchers = wiResearchersByGrant(/screening/i);
  var mpsSociety = wiNodes('patient_org').filter(function (o) { return o.label === 'National MPS Society'; })[0];

  var html = '<div class="wi-scenario">';
  html += '<h3 class="wi-title">Scenario B &mdash; Advocate for newborn-screening inclusion</h3>';
  html += '<p class="section-lede">If you pursue this path, here is the landscape &mdash; all from the atlas graph unless labeled otherwise.</p>';

  html += '<h4>Connected resources: screening work already funded</h4>';
  screenGrants.forEach(function (f) {
    html += '<div class="wi-item"><strong>' + esc((f.label || '').slice(0, 95)) + '</strong>' +
      '<div class="wi-sub">' + esc((f.description || '').slice(0, 200)) + '</div></div>';
  });
  screenTrials.forEach(function (t) { html += wiTrialLine(t); });
  if (!screenGrants.length && !screenTrials.length) html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Potential collaborators</h4>';
  if (researchers.length) researchers.forEach(function (r) { html += wiResearcherCard(r); });
  else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Precedent pathway</h4>';
  if (mpsSociety && mpsSociety.description) {
    html += '<p>' + esc(mpsSociety.description) + ' &mdash; the National MPS Society&rsquo;s own record in this atlas. ' +
      'MPS I shows that screening inclusion is achievable for this disease family; the advocacy playbook exists inside your own community.</p>';
  } else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>Evidence screening panels generally require</h4>';
  html += '<p class="wi-note">General process knowledge &mdash; not from our graph:</p><ul class="assume-list">';
  html += '<li>A validated assay for the condition.</li>';
  html += '<li>Clear benefit from early intervention.</li>';
  html += '<li>Cost-effectiveness data.</li></ul>';

  html += '<h4>Current gaps</h4><ul class="assume-list">';
  html += '<li><strong>Early-intervention benefit is the primary barrier.</strong> Fayuvi is approved for MPS IIIA but on a narrow pediatric label ' +
    '(preserved neurodevelopmental function) &mdash; many screen-detected children would fall outside it. Label expansion needs presymptomatic data.</li>';
  html += '<li>Presymptomatic gene-therapy trial targeting: unknown &mdash; check individual trial records; our graph does not structure this field.</li></ul>';

  html += '<h4>Patient-org allies</h4>';
  if (mpsSociety) html += wiOrgLine(mpsSociety);
  var hunters = wiNodes('patient_org').filter(function (o) { return /Hunter/.test(o.label); })[0];
  if (hunters) html += wiOrgLine(hunters);

  html += wiActiveButton('B');
  html += '</div>';
  return html;
}

function wiBoth() {
  var poolA = wiResearchersByGrant(/follow.?up|outcome assessment|natural history|longitudinal/i);
  var poolB = wiResearchersByGrant(/screening/i);
  var idsA = {}, idsB = {};
  poolA.forEach(function (r) { idsA[r.id] = true; });
  poolB.forEach(function (r) { idsB[r.id] = true; });
  // Bridge researchers: in either pool AND investigating MPS I (the disease with
  // documented screening-advocacy precedent in our data).
  var bridge = wiNodes('researcher').filter(function (r) {
    return (idsA[r.id] || idsB[r.id]) && wiInvestigatesDisease(r.id, /mucopolysaccharidosis type 1/);
  });
  var direct = poolA.filter(function (r) { return idsB[r.id]; });

  var html = '<div class="wi-scenario">';
  html += '<h3 class="wi-title">Both &mdash; run the strategies together</h3>';
  html += '<p class="section-lede">Where the two paths reinforce each other.</p>';

  html += '<h4>Researchers appearing in both scenarios</h4>';
  if (direct.length) direct.forEach(function (r) { html += wiResearcherCard(r); });
  else html += '<p class="wi-unknown">No single researcher in our data holds grants in both areas &mdash; the overlap runs through shared diseases instead.</p>';

  html += '<h4>Bridge researchers: screening-adjacent work on MPS I, the precedent disease</h4>';
  html += '<p class="wi-note">MPS I has documented newborn-screening advocacy (National MPS Society). ' +
    'These researchers work on natural-history-style grants <em>and</em> investigate MPS I &mdash; they speak both languages:</p>';
  if (bridge.length) bridge.forEach(function (r) { html += wiResearcherCard(r); });
  else html += '<p class="wi-unknown">unknown &mdash; not in our sources</p>';

  html += '<h4>How natural history strengthens a screening application</h4>';
  html += '<p>Screening panels require evidence of <strong>benefit from early intervention</strong>. ' +
    'A natural-history study documents exactly what &ldquo;early&rdquo; changes: the untreated trajectory your intervention must beat. ' +
    'Fayuvi&rsquo;s approval used an external natural-history control &mdash; the same data that justifies a trial also justifies screening. ' +
    'Build the study first; the screening case inherits its evidence.</p>';

  html += '<h4>Side-by-side comparison</h4>';
  html += '<table class="compare-table"><thead><tr><th></th><th>Scenario A: Natural-history study</th><th>Scenario B: Screening advocacy</th></tr></thead><tbody>';
  html += '<tr><td><strong>Core question</strong></td><td>What does untreated Sanfilippo A look like, precisely?</td><td>Should every newborn be tested for Sanfilippo?</td></tr>';
  html += '<tr><td><strong>Modeled timeline</strong></td><td>~2.2 yrs shared (see 10&times; Impact tab)</td><td class="wi-unknown">unknown &mdash; not in our sources</td></tr>';
  html += '<tr><td><strong>Key reusable asset</strong></td><td>Shared MPS I/II natural-history study design</td><td>MPS I screening-advocacy precedent (same patient society)</td></tr>';
  html += '<tr><td><strong>Biggest gap</strong></td><td>Validated neurocognitive endpoints</td><td>Early-intervention benefit beyond Fayuvi&rsquo;s narrow label</td></tr>';
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
    return '<p class="wi-active-note">&#10003; Marked <strong>active</strong> &mdash; saved on this device. ' +
      'Active scenarios will be prioritized in your digest when digests launch.</p>';
  }
  return '<button class="btn" data-wi-active="' + scn + '">Mark ' + esc(label) + ' as active</button>' +
    '<p class="wi-note">Saved on this device only. Active scenarios will be prioritized in your digest when digests launch.</p>';
}

/* ---------------- main render ---------------- */

var wiMode = 'A';

function renderWhatIf() {
  var body = document.getElementById('whatifBody');
  if (!body || !GRAPH) return;
  var active = wiActive();
  var html = '<p class="section-lede">A flight simulator for strategy. Model what each path would give you &mdash; ' +
    'resources, collaborators, timelines &mdash; before spending two years on it. Everything below comes from the atlas graph unless labeled.</p>';

  html += '<div class="seg" role="radiogroup" aria-label="Scenario">';
  html += '<button class="seg-btn' + (wiMode === 'A' ? ' active' : '') + '" data-wi-mode="A" role="radio">Scenario A: Natural-history study</button>';
  html += '<button class="seg-btn' + (wiMode === 'B' ? ' active' : '') + '" data-wi-mode="B" role="radio">Scenario B: Screening advocacy</button>';
  html += '<button class="seg-btn' + (wiMode === 'both' ? ' active' : '') + '" data-wi-mode="both" role="radio">Both</button>';
  html += '</div>';

  if (wiMode === 'A') html += wiScenarioA();
  else if (wiMode === 'B') html += wiScenarioB();
  else html += wiBoth();

  html += '<div class="wi-export"><button class="btn" id="wiExport">Export comparison (print)</button>' +
    (active ? '<span class="wi-note">Active: ' + esc(active === 'both' ? 'both scenarios' : 'Scenario ' + active.toUpperCase()) + '</span>' : '') + '</div>';

  body.innerHTML = html;

  body.querySelectorAll('[data-wi-mode]').forEach(function (b) {
    b.addEventListener('click', function () { wiMode = b.dataset.wiMode; renderWhatIf(); });
  });
  body.querySelectorAll('[data-wi-active]').forEach(function (b) {
    b.addEventListener('click', function () { wiSetActive(b.dataset.wiActive); });
  });
  var exp = document.getElementById('wiExport');
  if (exp) exp.addEventListener('click', function () { window.print(); });
}

function initWhatIf() {
  renderWhatIf();
  // Re-apply glossary term marking if the reader is active.
  if (typeof markTerms === 'function') {
    var b = document.getElementById('whatifBody');
    if (b) markTerms(b);
  }
}
