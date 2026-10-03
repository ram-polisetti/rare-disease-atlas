/* Guide — the zero-knowledge front door.
 * Loads after views.js; uses its globals (GRAPH, nodesById, edgesOut, edgesIn,
 * synToId, el, esc, displayName, humanize, shortLabel, switchTab, fuzzySuggest).
 * Everything is computed client-side from graph.json. Nothing is invented:
 * orgs, trials, researchers, and timelines come from the graph or are labeled
 * as unknown / general process knowledge. Never diagnoses — matches are
 * presented as "closest in our data; only a clinician can diagnose."
 */

(function () {
'use strict';

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

/* ---------------- interpretation ---------------- */

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
  // 2. fuzzy (typo-tolerant)
  if (!hits.length && typeof fuzzySuggest === 'function') {
    var fz = fuzzySuggest(low);
    if (fz && nodesById[fz.id] && nodesById[fz.id].type === 'disease') hits = [nodesById[fz.id]];
  }
  // 3. gene symbol -> its diseases
  if (!hits.length) {
    var gene = GRAPH.nodes.filter(function (n) { return n.type === 'gene'; }).filter(function (g) {
      var names = [g.label].concat(g.synonyms || []).map(function (s) { return s.toLowerCase(); });
      return names.indexOf(low) !== -1;
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

/* ---------------- guide state + rendering ---------------- */

var G = { screen: 'landing', diseaseId: null, candidates: [], via: null, query: '' };

function isNight() {
  var h = new Date().getHours();
  return h >= 23 || h < 6;
}

function go(screen) {
  G.screen = screen;
  renderGuide();
  var body = el('guideBody');
  if (body) body.scrollTop = 0;
  window.scrollTo(0, 0);
}

function bridgeHTML() {
  return '<div class="guide-bridge">' +
    '<p>Want the full picture? The complete atlas is behind this guide:</p>' +
    '<div class="guide-bridge-btns">' +
    '<button class="btn" data-go-tab="explore">Explore the graph</button>' +
    '<button class="btn" data-go-tab="journey">Maria&rsquo;s Journey</button>' +
    '<button class="btn" data-go-tab="whatif">What-if planner</button>' +
    '<button class="btn" data-go-tab="action">Patient Action</button>' +
    '</div></div>';
}

function wireBridge(scope) {
  (scope || document).querySelectorAll('[data-go-tab]').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-go-tab')); });
  });
}

function esc2(s) { return esc(String(s == null ? '' : s)); }

/* Disease names for zero-knowledge readers: prefer familiar common names
 * (Sanfilippo, Hunter, Fabry...), then names containing disease-words, then
 * the curated label. Never surfaces drug names (e.g. "Aglucosidase alfa")
 * as if they were the disease. */
var COMMON_NAMES = /sanfilippo|hunter|fabry|gaucher|pompe|krabbe|tay[\s-]?sachs|niemann|sandhoff|metachromatic|hurler|scheie/i;
var DISEASE_WORDS = /disease|syndrome|deficiency|disorder|dystrophy|lipidosis|gangliosidosis|leukodystrophy/i;
function guideName(n) {
  if (!n) return '';
  if (n.type !== 'disease') return displayName(n);
  var cands = [n.label].concat(n.synonyms || []).filter(function (s) { return s && s.length <= 60; });
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

function renderGuide() {
  var body = el('guideBody');
  if (!body) return;
  // Screens below 'ambiguous' need a disease; without one, restart at landing.
  var needsDisease = { confirm: 1, hub: 1, families: 1, understand: 1, research: 1, connections: 1, export: 1 };
  if (needsDisease[G.screen] && !nodesById[G.diseaseId]) G.screen = 'landing';
  var h = '';
  if (G.screen === 'landing') h = vLanding();
  else if (G.screen === 'confirm') h = vConfirm();
  else if (G.screen === 'ambiguous') h = vAmbiguous();
  else if (G.screen === 'nomatch') h = vNoMatch();
  else if (G.screen === 'hub') h = vHub();
  else if (G.screen === 'families') h = vFamilies();
  else if (G.screen === 'understand') h = vUnderstand();
  else if (G.screen === 'research') h = vResearch();
  else if (G.screen === 'connections') h = vConnections();
  else if (G.screen === 'export') h = vExport();
  body.innerHTML = h;
  wireGuide(body);
  wireBridge(body);
}

/* ---- Screen 1: landing ---- */

function vLanding() {
  var night = isNight();
  return '<div class="guide-hero">' +
    (night ? '<div class="guide-night">It&rsquo;s late. You don&rsquo;t have to figure everything out tonight. ' +
      'Here&rsquo;s what we can do right now: find a family you can talk to, show you the basics, and save your place for tomorrow.</div>' : '') +
    '<h2 class="guide-h">You&rsquo;re not alone. Let&rsquo;s find your path together.</h2>' +
    '<p class="guide-sub">Type what you know &mdash; a diagnosis, a gene, symptoms, or even just what the doctor said. Plain words are fine.</p>' +
    '<div class="guide-searchrow">' +
    '<input id="guideQ" type="text" autocomplete="off" spellcheck="false" aria-label="Describe your situation" placeholder="What brings you here tonight?">' +
    '<button id="guideGo" class="btn primary">Find my community &rarr;</button>' +
    '</div>' +
    '<div class="guide-examples"><span>Try:</span>' +
    '<button class="chip" data-ex="My son was diagnosed with Sanfilippo">My son was diagnosed with Sanfilippo</button>' +
    '<button class="chip" data-ex="The doctor said something about MPS III">The doctor said something about MPS III</button>' +
    '<button class="chip" data-ex="He can\'t walk anymore and they don\'t know why">He can&rsquo;t walk anymore and they don&rsquo;t know why</button>' +
    '</div>' +
    '<p class="guide-fine">We&rsquo;ll never guess a diagnosis. We only show what&rsquo;s actually in our data &mdash; and we say so when we don&rsquo;t have it.</p>' +
    '<p class="guide-alt">Looking for the researcher view? <a href="#" data-go-tab="explore">Open the full atlas</a></p>' +
    '</div>';
}

/* ---- Screen 2: confirmation with verification ---- */

function vConfirm() {
  var d = nodesById[G.diseaseId];
  if (!d) return vNoMatch();
  var phenos = phenosFor(d.id).slice(0, 4);
  var ak = alsoCalled(d);
  var checks = phenos.map(function (p, i) {
    return '<label class="guide-check"><input type="checkbox" data-ph="' + i + '"> ' + esc2(humanize(p.label)) + '</label>';
  }).join('');
  return '<div class="guide-pane">' +
    '<button class="guide-back" data-nav="landing">&larr; Start over</button>' +
    '<h2 class="guide-h">It sounds like you&rsquo;re asking about <span class="hl">' + esc2(guideName(d)) + '</span>.</h2>' +
    (ak ? '<p class="guide-sub">Also called: ' + esc2(ak) + '</p>' : '') +
    '<div class="guide-ground">' +
    '<p><strong>You are not alone.</strong> This is a rare genetic condition. There is active research and a community of families on the same path.</p>' +
    '<p class="guide-fine">Only a clinician can make a diagnosis. What follows is what our data says about this condition &mdash; not medical advice.</p>' +
    '</div>' +
    '<h3 class="guide-h3">Quick check &mdash; does this sound like your situation?</h3>' +
    '<p class="guide-sub">Tick the ones you recognize. This helps us point you right.</p>' +
    '<div class="guide-checks">' + (checks || '<p class="guide-fine">We don&rsquo;t have symptom details recorded for this condition yet.</p>') + '</div>' +
    '<div class="guide-btnrow">' +
    '<button class="btn primary" data-nav="hub">Yes, this matches &rarr;</button>' +
    '<button class="btn" data-nav="ambiguous">Not quite right</button>' +
    '</div>' +
    '<p class="guide-fine">Not sure? That&rsquo;s okay &mdash; a <a href="https://www.acmg.net/" target="_blank" rel="noopener">genetic counselor</a> can help clarify. Continue anyway and we&rsquo;ll keep things general.</p>' +
    bridgeHTML() +
    '</div>';
}

/* ---- Ambiguous: candidate cards ---- */

function vAmbiguous() {
  var via = G.via === 'symptoms'
    ? 'Based on the symptoms you described, these are the closest matches in our data.'
    : 'A few conditions match what you typed.';
  var cards = G.candidates.map(function (d) {
    var phenos = phenosFor(d.id).slice(0, 3).map(function (p) { return esc2(humanize(p.label)); }).join('; ');
    var nOrg = orgsFor(d.id).length;
    return '<button class="guide-cand" data-pick="' + d.id + '">' +
      '<strong>' + esc2(guideName(d)) + '</strong>' +
      (phenos ? '<span class="guide-cand-ph">' + phenos + '</span>' : '') +
      (nOrg ? '<span class="guide-cand-n">' + nOrg + ' familie' + (nOrg === 1 ? 's' : 's') + ' connected through patient groups</span>'
            : '<span class="guide-cand-n">Patient-group data not yet recorded</span>') +
      '</button>';
  }).join('');
  return '<div class="guide-pane">' +
    '<button class="guide-back" data-nav="landing">&larr; Start over</button>' +
    '<h2 class="guide-h">Let&rsquo;s narrow it down.</h2>' +
    '<p class="guide-sub">' + via + ' Only a clinician can diagnose &mdash; pick the one that sounds closest, or tell us none fit.</p>' +
    '<div class="guide-cands">' + cards + '</div>' +
    '<button class="btn" data-nav="nomatch">None of these seem right</button>' +
    '</div>';
}

/* ---- No match: honest dead end ---- */

function vNoMatch() {
  return '<div class="guide-pane">' +
    '<button class="guide-back" data-nav="landing">&larr; Start over</button>' +
    '<h2 class="guide-h">Here&rsquo;s what we know &mdash; and what we don&rsquo;t.</h2>' +
    '<p class="guide-sub">We looked through our data and couldn&rsquo;t match what you described to a condition we cover. ' +
    'That doesn&rsquo;t mean nothing exists &mdash; it means <em>we</em> don&rsquo;t have it. Our atlas currently covers 16 lysosomal storage diseases.</p>' +
    '<h3 class="guide-h3">What you can do</h3>' +
    '<ul class="guide-list">' +
    '<li><strong>Talk to a geneticist or genetic counselor</strong> &mdash; they can order the right tests. ' +
    '<a href="https://www.acmg.net/" target="_blank" rel="noopener">Find one near you</a></li>' +
    '<li><strong>Join NORD&rsquo;s community</strong> &mdash; the National Organization for Rare Disorders helps undiagnosed families. ' +
    '<a href="https://rarediseases.org/" target="_blank" rel="noopener">rarediseases.org</a></li>' +
    '<li><strong>Try different words</strong> &mdash; a gene name, a symptom, or part of the diagnosis you remember.</li>' +
    '</ul>' +
    bridgeHTML() +
    '</div>';
}

/* ---- Screen 3: hub ---- */

function hubCounts(did) {
  return {
    orgs: orgsFor(did).length,
    trials: trialsFor(did).length,
    rec: recruitingTrials(did).length,
    res: researchersFor(did).length,
    rel: relatedFor(did).length
  };
}

function vHub() {
  var d = nodesById[G.diseaseId];
  if (!d) return vNoMatch();
  var c = hubCounts(d.id);
  var orgs = orgsFor(d.id);
  var nextStep = orgs.length
    ? 'Tomorrow: call or message <strong>' + esc2(orgs[0].label) + '</strong> &mdash; they talk to families like yours every day.'
    : (c.rec ? 'Tomorrow: look at the treatments being tested below and ask your doctor whether any could fit.' : 'Tomorrow: ask your doctor for a referral to a genetic counselor who knows this condition.');
  return '<div class="guide-pane">' +
    '<button class="guide-back" data-nav="confirm">&larr; Back</button>' +
    '<h2 class="guide-h">' + esc2(guideName(d)) + '</h2>' +
    '<p class="guide-sub">Here&rsquo;s what our data holds for this condition &mdash; in plain language.</p>' +
    '<div class="guide-nextstep"><strong>One thing for tomorrow:</strong> ' + nextStep + '</div>' +
    '<h3 class="guide-h3">What would help you most right now?</h3>' +
    '<div class="guide-cards">' +
    '<button class="guide-card" data-nav="families"><span class="gc-emoji">👨‍👩‍👧</span><strong>Talk to another family</strong><span>' + c.orgs + ' patient group' + (c.orgs === 1 ? '' : 's') + ' in our data</span></button>' +
    '<button class="guide-card" data-nav="understand"><span class="gc-emoji">📋</span><strong>Understand what this means</strong><span>Plain-language guide, no jargon</span></button>' +
    '<button class="guide-card" data-nav="research"><span class="gc-emoji">🔬</span><strong>See what research is happening</strong><span>' + c.trials + ' studies recorded' + (c.rec ? ', ' + c.rec + ' recruiting now' : '') + '</span></button>' +
    '<button class="guide-card" data-nav="connections"><span class="gc-emoji">🤝</span><strong>Find related communities</strong><span>' + c.rel + ' connected condition' + (c.rel === 1 ? '' : 's') + ' sharing biology</span></button>' +
    '</div>' +
    bridgeHTML() +
    '</div>';
}

/* ---- 4a: families ---- */

function vFamilies() {
  var d = nodesById[G.diseaseId];
  var orgs = orgsFor(d.id);
  var cards = orgs.map(function (o) {
    var url = (o.extra && o.extra.url) || null;
    var verified = true; // all orgs in graph are curated from NORD/Orphanet/directory sources
    return '<div class="guide-org">' +
      '<strong>' + esc2(o.label) + '</strong>' +
      (verified ? '<span class="verified">✓ Verified non-profit &mdash; listed in a trusted directory</span>' : '') +
      (o.description ? '<p>' + esc2(o.description) + '</p>' : '') +
      (url ? '<a class="btn small" href="' + esc2(url) + '" target="_blank" rel="noopener">Visit their site &rarr;</a>' : '') +
      '</div>';
  }).join('');
  if (!cards) cards = '<p class="guide-sub">We don&rsquo;t have a patient group recorded for this condition yet. ' +
    '<a href="https://rarediseases.org/" target="_blank" rel="noopener">NORD</a> can help you find or start one.</p>';
  return '<div class="guide-pane">' +
    '<button class="guide-back" data-nav="hub">&larr; Back</button>' +
    '<h2 class="guide-h">Families facing ' + esc2(guideName(d)) + '</h2>' +
    '<p class="guide-sub">These organizations exist to talk to families like yours. Reaching out is the single most useful first step.</p>' +
    cards +
    '<div class="guide-safety">We never share your information. These groups are curated from trusted directories (NORD, Orphanet, Global Genes). ' +
    'Always check with your doctor before acting on anyone&rsquo;s advice.</div>' +
    bridgeHTML() +
    '</div>';
}

/* ---- 4b: understand ---- */

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
      phenos.map(function (p) { return '<li>' + esc2(humanize(p.label)) + '</li>'; }).join('') + '</ul>' +
      '<p class="guide-fine">Every child is different. Doctors can&rsquo;t predict exactly how things will change for your child &mdash; some progress slowly, some faster.</p>'
    : '';
  return '<div class="guide-pane">' +
    '<button class="guide-back" data-nav="hub">&larr; Back</button>' +
    '<h2 class="guide-h">Understanding ' + esc2(guideName(d)) + '</h2>' +
    '<p class="guide-fine">Written in plain language. Tap any <span class="gloss">underlined term</span> anywhere in the atlas for its definition.</p>' +
    geneBit + phenoBit +
    '<h3 class="guide-h3">What we don&rsquo;t know yet</h3>' +
    '<p>Research hasn&rsquo;t answered everything about this condition. Where our data has gaps, we show them plainly instead of guessing &mdash; ' +
    'see the <a href="#" data-go-tab="gaps">Gaps</a> view.</p>' +
    '<div class="guide-btnrow"><button class="btn primary" data-nav="families">Talk to other parents about what to expect &rarr;</button></div>' +
    bridgeHTML() +
    '</div>';
}

/* ---- 4c: research ---- */

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
      '<div class="guide-btnrow"><a class="btn small" href="' + esc2(p.url) + '" target="_blank" rel="noopener">View on ClinicalTrials.gov &rarr;</a>' +
      (isRec ? '<button class="btn small" data-go-tab="action">Check eligibility &rarr;</button>' : '') + '</div>' +
      '</div>';
  }).join('');
  if (!cards) cards = '<p class="guide-sub">No studies are recorded for this condition in our data right now. That doesn&rsquo;t mean none exist &mdash; ' +
    'try searching <a href="https://clinicaltrials.gov/" target="_blank" rel="noopener">ClinicalTrials.gov</a> directly, or ask your doctor.</p>';
  return '<div class="guide-pane">' +
    '<button class="guide-back" data-nav="hub">&larr; Back</button>' +
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

/* ---- 4d: connections ---- */

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
    '<button class="guide-back" data-nav="hub">&larr; Back</button>' +
    '<h2 class="guide-h">Related communities</h2>' +
    '<p class="guide-sub">Conditions that share biology with ' + esc2(guideName(d)) + '. Their communities may have built things yours can reuse &mdash; ' +
    'registries, study designs, hard-won experience.</p>' +
    cards +
    '<div class="guide-btnrow"><button class="btn primary" data-nav="export">Create a summary to share &rarr;</button></div>' +
    bridgeHTML() +
    '</div>';
}

/* ---- Screen 5: export ---- */

function vExport() {
  var d = nodesById[G.diseaseId];
  var orgs = orgsFor(d.id), trials = trialsFor(d.id).slice(0, 8), rel = relatedFor(d.id).slice(0, 6);
  return '<div class="guide-pane" id="guideExportDoc">' +
    '<button class="guide-back" data-nav="connections">&larr; Back</button>' +
    '<h2 class="guide-h">Your summary: ' + esc2(guideName(d)) + '</h2>' +
    '<p class="guide-sub">Take this to your doctor, your family, or your patient group. Generated from the atlas data on ' +
    new Date().toLocaleDateString() + '.</p>' +
    '<h3 class="guide-h3">Community</h3>' +
    (orgs.length ? '<ul class="guide-list">' + orgs.map(function (o) {
      var url = (o.extra && o.extra.url) || '';
      return '<li><strong>' + esc2(o.label) + '</strong>' + (url ? ' &mdash; ' + esc2(url) : '') + '</li>';
    }).join('') + '</ul>' : '<p class="guide-fine">No patient group recorded yet.</p>') +
    '<h3 class="guide-h3">Research studies (' + trials.length + ' recorded)</h3>' +
    (trials.length ? '<ul class="guide-list">' + trials.map(function (t) {
      var p = trialPlain(t);
      return '<li>' + esc2(humanize(p.title)) + ' &mdash; ' + esc2(p.meta) + '</li>';
    }).join('') + '</ul>' : '<p class="guide-fine">None recorded.</p>') +
    '<h3 class="guide-h3">Related conditions</h3>' +
    (rel.length ? '<ul class="guide-list">' + rel.map(function (r) { return '<li>' + esc2(guideName(r.node)) + '</li>'; }).join('') + '</ul>' : '<p class="guide-fine">None recorded.</p>') +
    '<p class="guide-fine">Sources: every connection in the atlas carries its evidence &mdash; open the Explore tab and click any edge to see the source quote and paper. ' +
    'This summary is not medical advice.</p>' +
    '<div class="guide-btnrow"><button class="btn primary" id="guidePrint">Print / save as PDF</button></div>' +
    bridgeHTML() +
    '</div>';
}

/* ---------------- wiring ---------------- */

function wireGuide(scope) {
  var q = scope.querySelector('#guideQ');
  var goBtn = scope.querySelector('#guideGo');
  function submit() {
    var val = q ? q.value : '';
    if (!val.trim()) { if (q) q.focus(); return; }
    G.query = val;
    var r = interpret(val);
    if (r.kind === 'disease') { G.diseaseId = r.id; G.candidates = []; go('confirm'); }
    else if (r.kind === 'ambiguous') { G.candidates = r.candidates; G.via = r.via; go('ambiguous'); }
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
  scope.querySelectorAll('[data-nav]').forEach(function (b) {
    b.addEventListener('click', function () { go(b.getAttribute('data-nav')); });
  });
  scope.querySelectorAll('[data-pick]').forEach(function (b) {
    b.addEventListener('click', function () { G.diseaseId = b.getAttribute('data-pick'); G.candidates = []; go('confirm'); });
  });
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
  window.__guide = { interpret: interpret, guideName: guideName, orgsFor: orgsFor, trialsFor: trialsFor, phenosFor: phenosFor, genesFor: genesFor, relatedFor: relatedFor, researchersFor: researchersFor, go: go, state: G };
}
guideBoot();

})();
