/* AI Atlas — additive views (views.js).
 * Loads after app.js and uses its globals (GRAPH, nodesById, displayName, esc,
 * humanize, linkifyRef, plainConfidence, evidenceLabel, incidentEdges, state,
 * switchTab, renderExplore, showNode, EVIDENCE_RANK, TYPE_COLORS).
 * Everything here ADDS views; the existing 4 tabs keep working untouched.
 */
'use strict';

function vEl(id) { return document.getElementById(id); }

/* initOutreach: the outreach composer is wired via the showNode override below,
 * so there is nothing to initialize — this no-op exists so viewsBoot() runs
 * to completion (compare, assets, journey builder, night mode, a11y). */
function initOutreach() {}

/* ---------------- boot (waits for graph) ---------------- */

var __viewsBooted = false;
function viewsBoot() {
  if (__viewsBooted) return;
  if (!window.__atlasReady || !GRAPH) { setTimeout(viewsBoot, 250); return; }
  __viewsBooted = true;
  initStartTab();
  initContradictions();
  initRecent();
  initGaps();
  initSubway();
  initSubwayToggle();
  initReading();
  initGlossary();
  initEligibility();
  initOutreach();
  initCompare();
  initAssets();
  initNightMode();
  initA11y();
  // Mobile: the guided front door is the landing page on narrow screens.
  if (window.innerWidth <= 700 && state.tab !== 'guide') switchTab('guide');
}
viewsBoot();

/* ---------------- levenshtein (fuzzy "did you mean?") ---------------- */

function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  let prev = new Array(bl + 1), cur = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    const ca = a.charAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ca === b.charAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[bl];
}

/* Best fuzzy match over all synonyms; null when nothing is close enough. */
function fuzzySuggest(q) {
  q = q.trim().toLowerCase();
  if (q.length < 3) return null;
  let bestKey = null, bestId = null, bestD = Infinity;
  const keys = Object.keys(synToId);
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k];
    if (Math.abs(key.length - q.length) > 4) continue;
    // Compare against the full synonym and each token.
    const cands = [key].concat(key.split(/[\s\/(),;-]+/));
    for (let c = 0; c < cands.length; c++) {
      const tok = cands[c];
      if (!tok || Math.abs(tok.length - q.length) > 3) continue;
      const d = levenshtein(q, tok);
      if (d < bestD) { bestD = d; bestKey = key; bestId = synToId[key]; }
      if (bestD === 1) break;
    }
    if (bestD === 1) break;
  }
  const thresh = Math.max(2, Math.floor(q.length * 0.3));
  return (bestKey && bestD <= thresh) ? { key: bestKey, id: bestId, dist: bestD } : null;
}

/* ---------------- 1. Persona landing pages ---------------- */

const PERSONAS = [
  {
    id: 'devon',
    title: 'My child was just diagnosed',
    desc: 'Plain-language answers: what this disease is, who else is on this path, and what is happening in research. No jargon.',
    cta: 'Start guided search'
  },
  {
    id: 'maria',
    title: 'I lead a patient organization',
    desc: 'Find shared assets, reusable study designs, potential collaborators, and the next concrete step for your community.',
    cta: 'Open action plan'
  },
  {
    id: 'priya',
    title: "I'm scouting therapeutic opportunities",
    desc: 'Browse related disease groups to see which share biology your approach could address.',
    cta: 'Browse clusters'
  },
  {
    id: 'osei',
    title: "I'm a researcher",
    desc: 'Search the full knowledge graph: genes, variants, phenotypes, trials, and the evidence behind every link.',
    cta: 'Search the graph'
  }
];

function diseaseOptions() {
  return GRAPH.nodes
    .filter(function (n) {
      return n.type === 'disease' && n.id && n.label &&
        !/\b(drug|therapy|treatment|compound)\b/i.test(n.label);
    })
    .sort(function (a, b) { return displayName(a).localeCompare(displayName(b)); });
}

function initStartTab() {
  const grid = vEl('personaGrid');
  if (!grid) return;
  grid.innerHTML = PERSONAS.map(function (p) {
    return '<article class="card persona-card">' +
      '<h2>' + esc(p.title) + '</h2>' +
      '<p>' + esc(p.desc) + '</p>' +
      '<button class="btn" data-persona="' + p.id + '">' + esc(p.cta) + '</button>' +
      '</article>';
  }).join('');
  grid.querySelectorAll('button[data-persona]').forEach(function (btn) {
    btn.addEventListener('click', function () { startPersona(btn.dataset.persona); });
  });
}

function startPersona(pid) {
  const box = vEl('guidedBox');
  box.hidden = false;
  if (pid === 'devon') renderDevonGuide(box);
  else if (pid === 'maria') renderMariaGuide(box);
  else if (pid === 'priya') { switchTab('clusters'); }
  else if (pid === 'osei') { switchTab('explore'); setTimeout(function(){ var s = vEl('search'); if (s) s.focus(); }, 50); }
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* Devon: guided disease search with fuzzy matching. */
function renderDevonGuide(box) {
  box.innerHTML =
    '<h3>What diagnosis are you searching for?</h3>' +
    '<p class="section-lede">Type the name as best you can &mdash; we will match it even with a typo.</p>' +
    '<div class="searchbar"><input id="guidedSearch" type="text" autocomplete="off" spellcheck="false" ' +
    'placeholder="e.g. sanfilippo" aria-label="Diagnosis search"><div id="guidedSug" class="suggestions" hidden></div></div>' +
    '<div id="guidedResult"></div>';
  const input = vEl('guidedSearch'), sug = vEl('guidedSug'), res = vEl('guidedResult');

  function pick(id) {
    sug.hidden = true; input.value = '';
    res.innerHTML = devonSummary(id);
    markTerms(res);
    res.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () {
        const go = b.dataset.goto;
        if (go === 'action') {
          const sel = vEl('diseaseSelect');
          if (sel && sel.querySelector('option[value="' + id + '"]')) { sel.value = id; sel.dispatchEvent(new Event('change')); }
          switchTab('action');
        } else if (go === 'explore') {
          state.center = id; switchTab('explore'); renderExplore();
        } else if (go === 'journey') { switchTab('journey'); }
      });
    });
  }

  input.addEventListener('input', function () {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      if (q.length === 1) { sug.innerHTML = '<div class="sug" style="cursor:default">Keep typing…</div>'; sug.hidden = false; }
      else { sug.hidden = true; }
      return;
    }
    const hits = [];
    const seen = new Set();
    Object.keys(synToId).forEach(function (key) {
      if (hits.length >= 6) return;
      const id = synToId[key];
      const n = nodesById[id];
      if (!n || n.type !== 'disease' || seen.has(id)) return;
      if (key.indexOf(q) !== -1) { hits.push({ key: key, id: id }); seen.add(id); }
    });
    let html = hits.map(function (h, i) {
      return '<button class="sug" data-i="' + i + '"><span class="sug-name">' +
        esc(displayName(nodesById[h.id])) + '</span><span class="sug-sub">matched &ldquo;' +
        esc(h.key) + '&rdquo;</span></button>';
    }).join('');
    if (!hits.length) {
      const fz = fuzzySuggest(q);
      if (fz && nodesById[fz.id] && nodesById[fz.id].type === 'disease') {
        html = '<button class="sug" data-fuzzy="1"><span class="sug-name">Did you mean ' +
          esc(displayName(nodesById[fz.id])) + '?</span><span class="sug-sub">close match for &ldquo;' +
          esc(input.value.trim()) + '&rdquo;</span></button>';
        sug.innerHTML = html;
        sug.hidden = false;
        sug.querySelector('[data-fuzzy]').addEventListener('click', function () { pick(fz.id); });
        return;
      }
      html = '<div class="sug" style="cursor:default">No match. Try a gene name (e.g. SGSH) or a broader term.</div>';
    } else {
      sug.innerHTML = html;
      sug.querySelectorAll('.sug[data-i]').forEach(function (b) {
        b.addEventListener('click', function () { pick(hits[Number(b.dataset.i)].id); });
      });
    }
    sug.hidden = false;
  });
  input.addEventListener('keydown', function (ev) {
    const btns = Array.prototype.slice.call(sug.querySelectorAll('.sug[data-i], .sug[data-fuzzy]'));
    const focused = sug.querySelector('.sug:focus');
    const idx = btns.indexOf(focused);
    if (ev.key === 'ArrowDown' && btns.length) {
      ev.preventDefault();
      btns[Math.min(idx + 1, btns.length - 1)].focus();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (idx > 0) btns[idx - 1].focus(); else input.focus();
    } else if (ev.key === 'Enter') {
      const first = focused || sug.querySelector('.sug[data-i], .sug[data-fuzzy]');
      if (first) { ev.preventDefault(); first.click(); }
    } else if (ev.key === 'Escape') { sug.hidden = true; input.focus(); }
  });
  setTimeout(function(){ input.focus(); }, 50);
}

function edgeCount(id, rels, types) {
  let n = 0;
  incidentEdges(id).forEach(function (e) {
    if (rels && rels.indexOf(e.relation) === -1) return;
    const other = e.source === id ? e.target : e.source;
    const t = nodesById[other];
    if (t && (!types || types.indexOf(t.type) !== -1)) n++;
  });
  return n;
}

/* Plain-language disease summary for a newly diagnosed family.
 * Only uses graph data; labeled as a starting point, not medical advice. */
function devonSummary(id) {
  const n = nodesById[id];
  const genes = [];
  incidentEdges(id).forEach(function (e) {
    const other = e.source === id ? e.target : e.source;
    const t = nodesById[other];
    if (t && t.type === 'gene' && genes.indexOf(t) === -1) genes.push(t);
  });
  const mechs = [];
  incidentEdges(id).forEach(function (e) {
    if (e.relation !== 'has_mechanism') return;
    const other = e.source === id ? e.target : e.source;
    const t = nodesById[other];
    if (t && t.type === 'mechanism' && mechs.indexOf(t.label) === -1) mechs.push(t.label);
  });
  const nPhen = edgeCount(id, ['has_phenotype', 'presents_with'], ['phenotype']);
  const trials = [];
  incidentEdges(id).forEach(function (e) {
    if (e.relation !== 'studied_in') return;
    const other = e.source === id ? e.target : e.source;
    const t = nodesById[other];
    if (t && t.type === 'trial') trials.push(t);
  });
  const nRec = trials.filter(function (t) { return (t.extra && t.extra.status) === 'RECRUITING'; }).length;
  const orgs = [];
  incidentEdges(id).forEach(function (e) {
    if (e.relation !== 'advocated_by') return;
    const other = e.source === id ? e.target : e.source;
    const t = nodesById[other];
    if (t && t.type === 'patient_org') orgs.push(t);
  });

  let html = '<div class="devon-card"><h3>' + esc(displayName(n)) + '</h3>';
  html += '<p class="medical-note">A starting point from research data &mdash; not medical advice. Bring questions to your care team.</p>';
  if (genes.length) {
    html += '<p><strong>Cause:</strong> changes in the ' +
      genes.map(function (g) { return esc(displayName(g)); }).join(', ') +
      ' gene' + (genes.length > 1 ? 's' : '') + '.</p>';
  }
  if (mechs.length) {
    html += '<p><strong>What goes wrong in the body:</strong> ' + esc(mechs.join('; ')) + '.</p>';
  }
  html += '<ul class="fact-list">';
  if (nPhen) html += '<li>' + nPhen + ' associated symptoms recorded in the graph</li>';
  html += '<li>' + trials.length + ' linked clinical trials' + (nRec ? ' (' + nRec + ' currently recruiting)' : '') + '</li>';
  if (orgs.length) html += '<li>' + orgs.length + ' patient organizations: ' +
    orgs.slice(0, 4).map(function (o) { return esc(displayName(o)); }).join(', ') + '</li>';
  html += '</ul>';
  html += '<div class="btn-row">' +
    '<button class="btn" data-goto="action">What can we do this week</button> ' +
    '<button class="btn" data-goto="explore">Explore the connections</button> ' +
    '<button class="btn" data-goto="journey">Follow one family&rsquo;s journey</button>' +
    '</div></div>';
  return html;
}

/* Maria: pick her disease, jump to the action plan. */
function renderMariaGuide(box) {
  box.innerHTML =
    '<h3>Which disease does your organization represent?</h3>' +
    '<div class="action-head"><select id="guidedDisease">' +
    diseaseOptions().map(function (d) {
      return '<option value="' + esc(d.id) + '">' + esc(displayName(d)) + '</option>';
    }).join('') + '</select> ' +
    '<button class="btn" id="guidedGo">Open action plan</button></div>' +
    '<p class="section-lede">You will see linked trials, patient organizations, reusable assets, open gaps, and the latest therapy developments.</p>';
  vEl('guidedGo').addEventListener('click', function () {
    const id = vEl('guidedDisease').value;
    const sel = vEl('diseaseSelect');
    if (sel) { sel.value = id; sel.dispatchEvent(new Event('change')); }
    switchTab('action');
  });
}

/* ---------------- 2. Contradiction Explorer ---------------- */

function disputedEdges() {
  return GRAPH.edges.filter(function (e) {
    return e.contradicts || /disput|contradict/i.test(e.note || '');
  });
}

function initContradictions() {
  const body = vEl('contradictionBody');
  const list = disputedEdges();
  const watched = watchedSet();
  if (!list.length) {
    body.innerHTML = '<p class="section-lede">No contested claims recorded in the current graph slice.</p>';
    return;
  }
  body.innerHTML = '<p class="section-lede"><strong>' + list.length +
    '</strong> contested claim' + (list.length === 1 ? '' : 's') +
    ' in this slice. Each is shown exactly as recorded &mdash; disagreement is data.</p>' +
    list.map(function (e, i) {
      const a = nodesById[e.source], b = nodesById[e.target];
      const ref = linkifyRef(e.source_ref);
      const key = e.source + '|' + e.relation + '|' + e.target;
      const isW = watched.indexOf(key) !== -1;
      return '<article class="card contra-card">' +
        '<h2>' + esc(displayName(a)) + ' &rarr; ' + esc(displayName(b)) + '</h2>' +
        '<div class="count">' + esc(humanize(e.relation)) + '</div>' +
        '<p><span class="badge warn">Contested</span></p>' +
        '<h3>What is claimed</h3><p>' + esc(e.note || (displayName(a) + ' ' + humanize(e.relation) + ' ' + displayName(b))) + '</p>' +
        (e.source_quote ? '<h3>Verbatim source quote</h3><p class="quote">&ldquo;' + esc(e.source_quote) + '&rdquo;</p>' : '') +
        '<h3>Source</h3><p class="item-sub">' + esc(e.source_db || 'unknown') +
        (ref ? ' &middot; <a href="' + esc(ref.url) + '" target="_blank" rel="noopener">' + esc(ref.label) + ' &rarr;</a>' : '') +
        (e.publication_year ? ' &middot; ' + esc(e.publication_year) : '') + '</p>' +
        '<h3>Confidence</h3><p><span class="badge conf-' + esc(e.confidence) + '">' + esc(e.confidence) +
        '</span> <span class="conf-plain">' + esc(plainConfidence(e)) + '</span></p>' +
        '<button class="btn" data-watch="' + esc(key) + '">' + (isW ? 'Watching &#10003;' : 'Watch this disagreement') + '</button>' +
        '</article>';
    }).join('');
  body.querySelectorAll('[data-watch]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      toggleWatch(btn.dataset.watch);
      btn.innerHTML = watchedSet().indexOf(btn.dataset.watch) !== -1 ? 'Watching &#10003;' : 'Watch this disagreement';
    });
  });
  markTerms(body);
}

function watchedSet() {
  try { return JSON.parse(localStorage.getItem('atlas_watch') || '[]'); }
  catch (err) { return []; }
}
function toggleWatch(key) {
  const w = watchedSet();
  const i = w.indexOf(key);
  if (i === -1) w.push(key); else w.splice(i, 1);
  try { localStorage.setItem('atlas_watch', JSON.stringify(w)); } catch (err) {}
}

/* ---------------- 4. "What Changed Recently" ---------------- */

let recentYears = 5;

function initRecent() {
  tagRadioGroup('[data-years]', 'Year range');
  document.querySelectorAll('[data-years]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-years]').forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      recentYears = Number(btn.dataset.years);
      renderRecent();
    });
  });
  renderRecent();
}

function recentEdges() {
  const cutoff = new Date().getFullYear() - recentYears;
  return GRAPH.edges.filter(function (e) {
    const y = parseInt(e.publication_year, 10);
    return y && y >= cutoff;
  }).sort(function (a, b) {
    return (parseInt(b.publication_year, 10) || 0) - (parseInt(a.publication_year, 10) || 0);
  });
}

function tagRadioGroup(sel, label) {
  var g = document.querySelector(sel);
  if (g && g.parentElement && !g.parentElement.getAttribute('role')) {
    g.parentElement.setAttribute('role', 'radiogroup');
    if (label) g.parentElement.setAttribute('aria-label', label);
  }
}
function renderRecent() {
  const body = vEl('recentBody');
  const keepScroll = body ? body.scrollTop : 0;
  const list = recentEdges();
  vEl('recentStats').textContent = list.length + ' findings';
  if (!list.length) {
    body.innerHTML = '<p class="section-lede">No findings in this window yet.</p>';
    return;
  }
  if (body) body.scrollTop = keepScroll;
  const byYear = {};
  list.forEach(function (e) {
    const y = e.publication_year;
    (byYear[y] = byYear[y] || []).push(e);
  });
  const years = Object.keys(byYear).sort().reverse().slice(0, 12);
  body.innerHTML = years.map(function (y) {
    const items = byYear[y].slice(0, 30);
    return '<h3 class="year-head">' + esc(y) + ' <span class="count">(' + byYear[y].length + ')</span></h3>' +
      '<div class="feed">' + items.map(function (e) {
        const a = nodesById[e.source], b = nodesById[e.target];
        const ref = linkifyRef(e.source_ref);
        return '<div class="feed-item">' +
          '<div class="feed-title">' + esc(displayName(a)) + ' &rarr; ' + esc(displayName(b)) + '</div>' +
          '<div class="item-sub">' + esc(humanize(e.relation)) +
          (e.evidence_type ? ' &middot; ' + esc(evidenceLabel(e.evidence_type)) : '') +
          (e.contradicts ? ' &middot; <span class="badge warn">contested</span>' : '') +
          (ref ? ' &middot; <a href="' + esc(ref.url) + '" target="_blank" rel="noopener">' + esc(ref.label) + ' &rarr;</a>' : '') +
          '</div>' +
          (e.source_quote ? '<div class="quote small-quote">&ldquo;' + esc(e.source_quote.slice(0, 280)) + '&rdquo;</div>' : '') +
          '</div>';
      }).join('') +
      (byYear[y].length > 30 ? '<p class="item-sub">+' + (byYear[y].length - 30) + ' more in ' + esc(y) + '</p>' : '') +
      '</div>';
  }).join('');
  markTerms(body);
}

/* ---------------- 10. Honest Gaps dashboard ---------------- */

function gapRefLink(e) {
  const ref = e.source_ref;
  if (!ref) return '';
  return /^https?:\/\//.test(ref)
    ? ' <a href="' + esc(ref) + '" target="_blank" rel="noopener">reference &rarr;</a>'
    : ' <span class="item-sub">(' + esc(ref) + ')</span>';
}

/* What references a disease actually has, grouped by source — so a visitor
 * can see exactly where coverage is thin, not just that it is. */
function gapRefsHtml(diseaseId) {
  const byDb = {};
  incidentEdges(diseaseId).forEach(function (e) {
    const db = e.source_db || 'unspecified';
    (byDb[db] = byDb[db] || []).push(e);
  });
  const dbs = Object.keys(byDb).sort();
  if (!dbs.length) return '<p class="item-sub">No linked references recorded for this disease.</p>';
  return '<ul class="gap-list">' + dbs.map(function (db) {
    const es = byDb[db];
    const items = es.slice(0, 3).map(function (e) {
      const other = nodesById[e.source === diseaseId ? e.target : e.source];
      return '<li>' + esc(displayName(other)) + ' &mdash; ' + esc(e.relation) + gapRefLink(e) + '</li>';
    }).join('');
    return '<li><strong>' + esc(db) + '</strong> &mdash; ' + es.length + ' link' + (es.length > 1 ? 's' : '') +
      '<ul>' + items + '</ul>' +
      (es.length > 3 ? '<p class="item-sub">Plus ' + (es.length - 3) + ' more.</p>' : '') + '</li>';
  }).join('') + '</ul>';
}

function initGaps() {
  const body = vEl('gapsBody');
  const diseases = GRAPH.nodes.filter(function (n) { return n.type === 'disease'; });
  const litCount = {}, trialCount = {}, orgCount = {};
  diseases.forEach(function (d) {
    litCount[d.id] = 0; trialCount[d.id] = 0; orgCount[d.id] = 0;
    incidentEdges(d.id).forEach(function (e) {
      const other = nodesById[e.source === d.id ? e.target : e.source];
      if (!other) return;
      if (other.type === 'paper' || e.publication_year) litCount[d.id]++;
      if (other.type === 'trial') trialCount[d.id]++;
      if (other.type === 'patient_org') orgCount[d.id]++;
    });
  });
  const thin = diseases
    .map(function (d) { return { d: d, lit: litCount[d.id], tr: trialCount[d.id], org: orgCount[d.id] }; })
    .sort(function (a, b) { return (a.lit + a.tr) - (b.lit + b.tr); })
    .slice(0, 8);

  let html = '<div class="cards">';
  html += '<article class="card"><h2>Thinly covered diseases</h2><p>Diseases with the fewest linked papers and trials in this slice. Treat conclusions about them as preliminary. Expand any disease to see exactly which references exist &mdash; and which kinds are missing.</p><ul class="gap-list">' +
    thin.map(function (t) {
      return '<li><details><summary><strong>' + esc(displayName(t.d)) + '</strong> &mdash; ' + t.lit + ' linked sources, ' + t.tr + ' trials, ' + t.org + ' patient orgs</summary>' +
        gapRefsHtml(t.d.id) + '</details></li>';
    }).join('') + '</ul></article>';

  html += '<article class="card"><h2>Source limitations</h2><ul class="gap-list">' +
    '<li>Literature extraction covers <strong>abstracts only</strong> &mdash; full text may hold additional evidence.</li>' +
    '<li><strong>OMIM was excluded</strong> (requires an API key); ClinVar and Monarch cover gene&ndash;disease links instead.</li>' +
    '<li>Trial records reflect registry snapshots; status may have changed since ingestion.</li>' +
    '<li>Preprints have not been peer-reviewed; they are labeled as such wherever they appear.</li>' +
    '</ul></article>';

  const lowEdges = GRAPH.edges.filter(function (e) { return e.evidence === 'inferred' && e.confidence === 'low'; });
  html += '<article class="card"><h2>Low-confidence regions</h2><p><strong>' + lowEdges.length +
    '</strong> edges are flagged inferred + low &mdash; the weakest derivations in the graph. They are kept visible and labeled, never hidden. Here they are, exactly:</p>' +
    '<ul class="gap-list">' + lowEdges.map(function (e) {
      const s = nodesById[e.source], t = nodesById[e.target];
      return '<li>' + esc(displayName(s)) + ' &mdash; ' + esc(e.relation) + ' &rarr; ' + esc(displayName(t)) + gapRefLink(e) + '</li>';
    }).join('') + '</ul>' +
    '<p class="item-sub">Rule of thumb: treat inferred links as leads to investigate, not facts to act on.</p></article>';

  const years = GRAPH.edges.map(function (e) { return parseInt(e.publication_year, 10) || 0; }).filter(Boolean);
  const maxY = years.length ? Math.max.apply(null, years) : null;
  html += '<article class="card"><h2>Recency</h2>' +
    (maxY ? '<p>Newest literature edge in the graph is from <strong>' + maxY + '</strong>. Anything published after ingestion is missing &mdash; use the Recent tab to see the coverage window.</p>'
          : '<p>No publication years recorded on literature edges.</p>') + '</article>';
  html += '</div>';
  body.innerHTML = html;
  markTerms(body);
}

/* ---------------- 5b. Subway view toggle (inside Clusters) ---------------- */

function initSubwayToggle() {
  const tg = vEl('subwayToggle');
  const wrap = vEl('subwayInClusters');
  if (!tg || !wrap) return;
  tg.addEventListener('change', function () { wrap.hidden = !tg.checked; });
}

/* ---------------- 5. Mechanism Subway Map ---------------- */

const LINE_COLORS = ['#2563eb', '#0d9488', '#c2410c', '#6d5fc0', '#a16207', '#0f766e', '#b45309'];

function subwayData() {
  const lines = [];
  const mechNodes = GRAPH.nodes.filter(function (n) { return n.type === 'mechanism'; });
  mechNodes.forEach(function (m) {
    const ds = [];
    incidentEdges(m.id).forEach(function (e) {
      if (e.relation !== 'has_mechanism') return;
      const other = nodesById[e.source === m.id ? e.target : e.source];
      if (other && other.type === 'disease' && ds.indexOf(other.id) === -1) ds.push(other.id);
    });
    if (ds.length) lines.push({ mech: m, diseases: ds });
  });
  return lines;
}

function initSubway() {
  const map = vEl('subwayMap');
  const lines = subwayData();
  if (!lines.length) {
    map.innerHTML = '<p class="section-lede">No mechanism lines in the graph.</p>';
    return;
  }
  // Disease x-order: most-connected first, then alphabetical (deterministic).
  const lineCount = {};
  lines.forEach(function (L) { L.diseases.forEach(function (d) { lineCount[d] = (lineCount[d] || 0) + 1; }); });
  const diseases = Object.keys(lineCount).sort(function (a, b) {
    return (lineCount[b] - lineCount[a]) || displayName(nodesById[a]).localeCompare(displayName(nodesById[b]));
  });
  const xOf = {};
  diseases.forEach(function (d, i) { xOf[d] = i; });

  const XS = 120, YS = 110, PADX = 170, PADY = 60;
  const W = PADX * 2 + Math.max(diseases.length - 1, 0) * XS;
  const H = PADY * 2 + (lines.length - 1) * YS;

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="subway-svg" role="img" ' +
    'aria-label="Subway-style map of shared disease mechanisms" style="min-width:' + W + 'px">';
  lines.forEach(function (L, li) {
    const y = PADY + li * YS;
    const color = LINE_COLORS[li % LINE_COLORS.length];
    const xs = L.diseases.map(function (d) { return xOf[d]; }).sort(function (a, b) { return a - b; });
    const x0 = PADX + xs[0] * XS, x1 = PADX + xs[xs.length - 1] * XS;
    // Line label (left).
    svg += '<text x="' + (PADX - 14) + '" y="' + (y + 5) + '" text-anchor="end" class="line-label" fill="' + color + '">' +
      esc(L.mech.label.length > 30 ? L.mech.label.slice(0, 29) + '…' : L.mech.label) + '</text>';
    // Line segment spanning its stations.
    svg += '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y +
      '" stroke="' + color + '" stroke-width="7" stroke-linecap="round" data-line="' + li + '" class="subway-line"/>';
    L.diseases.forEach(function (d) {
      const x = PADX + xOf[d] * XS;
      const transfer = lineCount[d] > 1;
      const label = shortLabel(nodesById[d], 22);
      svg += '<g class="station" data-disease="' + esc(d) + '" data-line="' + li + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(displayName(nodesById[d])) + ' on ' + esc(L.mech.label) + '">';
      if (transfer) {
        svg += '<circle cx="' + x + '" cy="' + y + '" r="14" fill="#fff" stroke="' + color + '" stroke-width="5"/>' +
               '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="' + color + '"/>';
      } else {
        svg += '<circle cx="' + x + '" cy="' + y + '" r="9" fill="' + color + '" stroke="#fff" stroke-width="3"/>';
      }
      // Label once per disease (on its first line) to avoid clutter.
      if (li === firstLineOf(diseases, lines, d)) {
        svg += '<text x="' + x + '" y="' + (y + 30) + '" text-anchor="middle" class="station-label">' +
          esc(label) + '</text>';
      }
      svg += '</g>';
    });
  });
  svg += '</svg>';
  map.innerHTML = svg;
  map.querySelectorAll('.station').forEach(function (g) {
    function go() { showSubwayStation(g.dataset.disease, lines, lineCount); }
    g.addEventListener('click', go);
    g.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
    });
  });
}

function firstLineOf(diseases, lines, d) {
  for (let li = 0; li < lines.length; li++) {
    if (lines[li].diseases.indexOf(d) !== -1) return li;
  }
  return 0;
}

function showSubwayStation(diseaseId, lines, lineCount) {
  const n = nodesById[diseaseId];
  const panel = vEl('subwayPanel');
  const myLines = lines.filter(function (L) { return L.diseases.indexOf(diseaseId) !== -1; });
  const researchers = [], trials = [];
  incidentEdges(diseaseId).forEach(function (e) {
    const other = nodesById[e.source === diseaseId ? e.target : e.source];
    if (!other) return;
    if (other.type === 'researcher' && researchers.indexOf(other) === -1) researchers.push(other);
    if (other.type === 'trial' && trials.indexOf(other) === -1) trials.push(other);
  });
  let html = '<span class="badge">' + esc(humanize(n.type)) + '</span>';
  html += '<h2>' + esc(displayName(n)) + '</h2>';
  if (lineCount[diseaseId] > 1) {
    html += '<p><span class="badge warn">Transfer station</span></p>' +
      '<p class="desc">This disease sits on <strong>' + myLines.length + ' lines</strong>: ' +
      myLines.map(function (L) { return esc(L.mech.label); }).join('; ') +
      '. Shared mechanisms mean research on one line may inform the others &mdash; but treatments do not automatically transfer.</p>';
  } else {
    html += '<p class="desc">On the <strong>' + esc(myLines[0].mech.label) + '</strong> line.</p>';
  }
  if (researchers.length) {
    html += '<h3>Researchers (' + researchers.length + ')</h3><ul class="syn-list">' +
      researchers.slice(0, 10).map(function (r) { return '<li>' + esc(displayName(r)) + '</li>'; }).join('') + '</ul>';
  }
  if (trials.length) {
    html += '<h3>Trials (' + trials.length + ')</h3><ul class="gap-list">' +
      trials.slice(0, 6).map(function (t) {
        const ex = t.extra || {};
        return '<li>' + esc(t.label) +
          (ex.nct ? ' <a href="https://clinicaltrials.gov/study/' + esc(ex.nct) + '" target="_blank" rel="noopener">' + esc(ex.nct) + ' &rarr;</a>' : '') +
          '</li>';
      }).join('') + '</ul>';
  }
  html += '<p><button class="btn" id="subwayOpen">Open in Explore</button></p>';
  panel.innerHTML = html;
  markTerms(panel);
  vEl('subwayOpen').addEventListener('click', function () {
    state.center = diseaseId;
    switchTab('explore');
    renderExplore();
  });
}

/* ---------------- 6. Reading-level toggle + glossary ---------------- */

const READING_KEY = 'atlas_reading';
let reading = 'standard';
try { reading = localStorage.getItem(READING_KEY) || 'standard'; } catch (err) {}

/* Plain-language definitions for technical terms. Standard medical
 * explanations, pre-written (never generated on the fly). */
const GLOSSARY = {
  'enzyme replacement therapy': 'A treatment that gives the body a replacement for a missing enzyme, usually through an IV drip. It can help many organs but often cannot reach the brain.',
  'substrate reduction therapy': 'A treatment that slows down production of the substance piling up in cells, so the limited working enzyme can keep up.',
  'chaperone therapy': 'A treatment using a small molecule that helps a faulty enzyme fold into the right shape so it can do its job.',
  'gene therapy': 'A treatment that delivers a working copy of a broken gene into the patient\u2019s cells, often using a modified virus as the carrier.',
  'hematopoietic stem cell transplant': 'A procedure replacing a patient\u2019s blood-forming stem cells with a donor\u2019s, so the new cells produce the missing enzyme. Also called bone marrow transplant.',
  'blood-brain barrier': 'A protective filter around the brain that keeps most medicines in the bloodstream from entering brain tissue. A major obstacle for treating brain diseases.',
  'adeno-associated virus': 'AAV: a small, harmless virus commonly used as a carrier to deliver working genes into cells in gene therapy.',
  'intravenous': 'IV: given directly into a vein, usually as a drip.',
  'intrathecal': 'Delivered directly into the fluid around the spinal cord, to reach the brain and nervous system.',
  'newborn screening': 'Testing babies shortly after birth for certain diseases, so treatment can start before symptoms appear.',
  'natural history study': 'A study that follows patients over time to document how a disease progresses without treatment \u2014 the baseline future trials are measured against.',
  'natural-history study': 'A study that follows patients over time to document how a disease progresses without treatment \u2014 the baseline future trials are measured against.',
  'clinical trial': 'A research study testing a treatment in people, run in phases with strict safety monitoring.',
  'phase 1': 'The first trial phase: mainly tests safety in a small group.',
  'phase 2': 'The second trial phase: tests whether the treatment works, in a larger group.',
  'phase 3': 'The final trial phase before approval: compares the treatment against standard care in a large group.',
  'phase 4': 'After a treatment is approved: keeps tracking safety in the general population.',
  'placebo': 'An inactive stand-in (like a sugar pill) used as a comparison so researchers can tell what the treatment itself does.',
  'endpoint': 'The specific thing a trial measures to decide whether a treatment works \u2014 for example, a memory test score or a brain scan result.',
  'biomarker': 'Something measurable in the body (in blood, urine, or scans) that tracks whether a disease is getting better or worse.',
  'patient registry': 'An organized collection of patient information \u2014 symptoms, test results, treatments \u2014 used for research.',
  'biobank': 'A stored collection of biological samples (blood, tissue, DNA) donated for research.',
  'orphan drug': 'A medicine developed for a rare disease, with special regulatory incentives because the patient population is small.',
  'compassionate use': 'Access to an unapproved treatment for a seriously ill patient outside of a clinical trial, when no alternative exists.',
  'off-label': 'Using an approved medicine for a condition it was not officially approved to treat.',
  'contraindication': 'A specific situation where a treatment should not be used because it could cause harm.',
  'neurodegeneration': 'The progressive loss of nerve cells in the brain, leading to declining abilities over time.',
  'heparan sulfate': 'A complex sugar molecule the body normally recycles. In Sanfilippo and related diseases it piles up inside cells, especially in the brain.',
  'sphingolipid': 'A type of fat molecule found in cell membranes. When its recycling breaks down, diseases like Gaucher and Tay-Sachs result.',
  'ganglioside': 'A fat-like molecule concentrated in nerve cells. GM2 ganglioside buildup causes Tay-Sachs and Sandhoff diseases.',
  'glycogen': 'The stored form of sugar in the body. In Pompe disease, it accumulates to damaging levels inside cells.',
  'glycosaminoglycan': 'GAG: long sugar chains the body constantly builds and recycles. MPS diseases are caused by failures in GAG recycling.',
  'lysosome': 'The cell\u2019s recycling center \u2014 a compartment filled with enzymes that break down waste. All the diseases in this atlas involve lysosomes.',
  'enzyme': 'A protein that speeds up a specific chemical job in the body, like breaking down waste.',
  'substrate': 'The substance an enzyme acts on \u2014 what gets broken down or built up.',
  'phenotype': 'The observable signs and symptoms of a disease.',
  'genotype': 'A person\u2019s genetic makeup \u2014 the specific gene variants they carry.',
  'variant': 'A change in a gene\u2019s DNA code. Some variants cause disease; many are harmless.',
  'mutation': 'A change in a gene\u2019s DNA code. Often used to mean a disease-causing variant.',
  'pathogenic': 'Disease-causing \u2014 a variant classified as pathogenic is believed to produce illness.',
  'allele': 'One of the two copies of a gene a person inherits, one from each parent.',
  'autosomal recessive': 'A disease pattern where a child must inherit a faulty gene copy from both parents to be affected.',
  'x-linked': 'A disease pattern where the faulty gene sits on the X chromosome \u2014 it affects boys more often and more severely.'
};
const GLOSS_KEYS = Object.keys(GLOSSARY).sort(function (a, b) { return b.length - a.length; });

/* ---------------- Tier-1 tap-for-definition ----------------
 * Jargon-tier agreement (FULL_SITE_BRAINSTORM.md): tier 1 = gene symbols,
 * trial phases, "natural history study", "endpoint", "biomarker".
 * One source of truth: GLOSSARY above holds the layer-1 (plain,
 * one-sentence) definition; TIER1_LAYERS adds layer-2 ("why it matters")
 * and layer-3 (clinical). Gene entries are built from the graph's gene
 * nodes at boot — labels from node.label, clinical text verbatim from
 * node.description (never rewritten). No LLM at runtime: static
 * dictionary only, offline-safe. */
const TIER1_LAYERS = {
  'natural history study': {
    why: 'You may be asked to join one even when no treatment exists yet: the records become the comparison group that future trials are measured against.',
    clinical: 'An observational, non-interventional study that documents the natural course of a disease — symptom onset, progression, and outcomes — to establish endpoints and baselines for future trials.'
  },
  'natural-history study': {
    why: 'You may be asked to join one even when no treatment exists yet: the records become the comparison group that future trials are measured against.',
    clinical: 'An observational, non-interventional study that documents the natural course of a disease — symptom onset, progression, and outcomes — to establish endpoints and baselines for future trials.'
  },
  'endpoint': {
    why: 'When a specialist names the endpoint a trial uses, it tells you what kind of improvement the trial is actually looking for.',
    clinical: 'A precisely defined variable in a trial protocol used to assess treatment effect. The primary endpoint determines whether the trial counts as a success for regulators.'
  },
  'biomarker': {
    why: 'Biomarkers let doctors track the disease without waiting for symptoms to change — which is why trials and natural-history studies measure them.',
    clinical: 'An objective, quantifiable characteristic — molecular, imaging, or physiological — that indicates a biological process and is used to monitor disease or treatment response.'
  },
  'phase 1': {
    why: 'Safety results come first — the phase tells you how much is known about a treatment so far.',
    clinical: 'First-in-human trials, typically in dozens of participants, focused on safety, tolerability, and dosing rather than whether the treatment works.'
  },
  'phase 2': {
    why: 'Phase 2 is where researchers first learn whether a treatment might actually help — and side effects become clearer.',
    clinical: 'Trials in tens to hundreds of participants that test effectiveness and further evaluate safety, still under close monitoring.'
  },
  'phase 3': {
    why: 'Phase 3 results are the evidence regulators use to decide whether a treatment gets approved.',
    clinical: 'Large trials comparing the treatment against the current standard of care, providing the evidence regulators require for approval.'
  },
  'phase 4': {
    why: 'Approval is not the end of safety monitoring — phase 4 watches for rare or long-term effects in everyday use.',
    clinical: 'Post-marketing studies that monitor long-term safety and effectiveness after approval, in larger and more diverse populations.'
  }
};
const GENE_TIER1_WHY = 'Gene symbols are how genetic test reports and trial listings name a gene — matching the symbol to your report is the fastest way to find relevant trials and specialists.';
/* key (lowercase) -> { plain, why, clinical }; built lazily so GRAPH is ready. */
const TIER1 = {};
let TIER1_KEYS = null;

function buildTier1() {
  if (TIER1_KEYS) return;
  if (GRAPH && GRAPH.nodes) {
    GRAPH.nodes.forEach(function (n) {
      if (!n || n.type !== 'gene' || !n.label) return;
      const key = String(n.label).toLowerCase();
      const desc = String(n.description || '');
      let plain = desc;
      const m = desc.match(/\.\s+((?:Deficiency|Mutations|Loss)[^.]*\.)/i);
      if (m) plain = m[1];
      TIER1[key] = { plain: plain, why: GENE_TIER1_WHY, clinical: desc };
    });
  }
  Object.keys(TIER1_LAYERS).forEach(function (k) {
    TIER1[k] = { plain: GLOSSARY[k] || '', why: TIER1_LAYERS[k].why, clinical: TIER1_LAYERS[k].clinical };
  });
  const merged = Object.keys(TIER1).concat(GLOSS_KEYS.filter(function (k) { return !TIER1[k]; }));
  TIER1_KEYS = merged.sort(function (a, b) { return b.length - a.length; });
}

function initReading() {
  tagRadioGroup('[data-reading]', 'Reading level');
  document.querySelectorAll('[data-reading]').forEach(function (btn) {
    const on = btn.dataset.reading === reading;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.addEventListener('click', function () { setReading(btn.dataset.reading); });
  });
  document.body.classList.remove('reading-plain', 'reading-standard', 'reading-detailed');
  document.body.classList.add('reading-' + (['plain', 'standard', 'detailed'].indexOf(reading) >= 0 ? reading : 'standard'));
  applyReading();
}

function setReading(r) {
  reading = r;
  try { localStorage.setItem(READING_KEY, r); } catch (err) {}
  /* Global hook: body class drives reading-level CSS on every tab.
   * Detailed reveals .tech-detail metadata (study types, dates);
   * plain hides jargon badges and technical metadata. */
  document.body.classList.remove('reading-plain', 'reading-standard', 'reading-detailed');
  document.body.classList.add('reading-' + (['plain', 'standard', 'detailed'].indexOf(r) >= 0 ? r : 'standard'));
  document.querySelectorAll('[data-reading]').forEach(function (btn) {
    const on = btn.dataset.reading === r;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  applyReading();
  let toast = vEl('readingToast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'readingToast'; toast.className = 'reading-toast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
  toast.textContent = vEl('readingCaption').textContent; toast.hidden = false;
  clearTimeout(window.atlasReadingToastTimer);
  window.atlasReadingToastTimer = setTimeout(function () { toast.hidden = true; }, 4000);
}

function applyReading() {
  const captions = {
    plain: 'Plain language: simpler wording, with technical metadata and jargon badges hidden.',
    standard: 'Standard: atlas wording, with medical definitions available on tap.',
    detailed: 'Detailed: showing study types, dates, source IDs, and inline explanations throughout the atlas.'
  };
  let caption = vEl('readingCaption');
  if (!caption) {
    caption = document.createElement('p'); caption.id = 'readingCaption';
    caption.className = 'reading-caption'; caption.setAttribute('aria-live', 'polite');
    document.querySelector('.reading-seg').insertAdjacentElement('afterend', caption);
  }
  caption.textContent = captions[reading] || captions.standard;
  document.querySelectorAll('[data-reading]').forEach(function (btn) { btn.title = captions[btn.dataset.reading]; });
  document.querySelectorAll('.inline-definition, .plain-definition').forEach(function (el) { el.remove(); });
  if (reading === 'plain') simplifyAtlasTerms(document);
  if (reading === 'detailed') expandAtlasDefinitions(document);
}

function simplifyAtlasTerms(root) {
  root.querySelectorAll('.gloss, .defterm').forEach(function (term) {
    if (term.nextElementSibling && term.nextElementSibling.classList.contains('plain-definition')) return;
    const definition = GLOSSARY[term.dataset.term];
    if (!definition) return;
    const explanation = document.createElement('span'); explanation.className = 'plain-definition';
    explanation.textContent = definition;
    term.classList.add('has-plain-definition'); term.insertAdjacentElement('afterend', explanation);
  });
}

function expandAtlasDefinitions(root) {
  root.querySelectorAll('.gloss, .defterm').forEach(function (term) {
    if (term.nextElementSibling && term.nextElementSibling.classList.contains('inline-definition')) return;
    const definition = GLOSSARY[term.dataset.term] || (TIER1[term.dataset.term] || {}).plain;
    if (!definition) return;
    const explanation = document.createElement('span');
    explanation.className = 'inline-definition tech-detail';
    explanation.textContent = ' (' + definition + ')';
    term.insertAdjacentElement('afterend', explanation);
  });
}

/* ---------------- glossary: tap-to-define ---------------- */

function isWordBoundary(low, idx, len) {
  const before = idx === 0 ? ' ' : low.charAt(idx - 1);
  const after = idx + len >= low.length ? ' ' : low.charAt(idx + len);
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

function markTerms(root) {
  if (!root) return;
  buildTier1();
  const keys = TIER1_KEYS;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p || p.closest('.gloss, .defterm, .defexp, .inline-definition, .plain-definition, script, style, a, button, input, select, textarea, .suggestions')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function (node) {
    let text = node.nodeValue;
    let low = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let pos = 0, found = false;
    while (pos < low.length) {
      let best = null, bestIdx = -1;
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        const idx = low.indexOf(key, pos);
        if (idx !== -1 && isWordBoundary(low, idx, key.length) &&
            (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && key.length > best.length))) {
          best = key; bestIdx = idx;
        }
      }
      if (best === null) break;
      found = true;
      frag.appendChild(document.createTextNode(text.slice(pos, bestIdx)));
      const matched = text.slice(bestIdx, bestIdx + best.length);
      let tag;
      if (TIER1[best]) {
        /* Tier-1 term: a real <button> that expands an inline,
         * three-layer definition right after itself. */
        tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'defterm';
        tag.dataset.term = best;
        tag.setAttribute('aria-expanded', 'false');
        tag.setAttribute('aria-label', matched + ': show definition');
      } else {
        tag = document.createElement('span');
        tag.className = 'gloss';
        tag.dataset.term = best;
        tag.setAttribute('tabindex', '0');
        tag.setAttribute('role', 'button');
        tag.setAttribute('aria-label', best + ': tap for definition');
      }
      tag.textContent = matched;
      frag.appendChild(tag);
      pos = bestIdx + best.length;
      low = low; // unchanged; text unchanged
    }
    if (!found) return;
    frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag, node);
  });
  if (reading === 'detailed') expandAtlasDefinitions(root);
  if (reading === 'plain') simplifyAtlasTerms(root);
}

/* ---------------- tier-1: inline inline-expansion ---------------- */

function closeDefterms(root) {
  (root || document).querySelectorAll('.defexp').forEach(function (d) {
    d.hidden = true;
    const b = d.previousElementSibling;
    if (b && b.classList && b.classList.contains('defterm')) b.setAttribute('aria-expanded', 'false');
  });
}

/* Toggle the inline three-layer definition directly after a .defterm
 * button. Inline (never a modal) so the reader keeps their place;
 * dismissible via the button again, the Close button, or Escape. */
function toggleDefterm(btn) {
  if (!btn) return;
  const sib = btn.nextElementSibling;
  if (sib && sib.classList && sib.classList.contains('defexp')) {
    const open = !sib.hidden;
    sib.hidden = open;
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    return;
  }
  buildTier1();
  const def = TIER1[btn.dataset.term] || { plain: '', why: '', clinical: '' };
  const exp = document.createElement('span');
  exp.className = 'defexp';
  exp.setAttribute('role', 'definition');
  exp.innerHTML = '<span class="defexp-card">' +
    '<span class="defexp-layer"><span class="defexp-tag">In plain words</span> ' + esc(def.plain || '') + '</span>' +
    '<span class="defexp-layer"><span class="defexp-tag">Why it matters</span> ' + esc(def.why || '') + '</span>' +
    '<span class="defexp-layer"><span class="defexp-tag">Clinical meaning</span> ' + esc(def.clinical || '') + '</span>' +
    '<button type="button" class="defexp-close btn small">Close</button></span>';
  btn.setAttribute('aria-expanded', 'true');
  btn.after(exp);
  exp.querySelector('.defexp-close').addEventListener('click', function (ev) {
    ev.stopPropagation();
    exp.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  });
}

function initGlossary() {
  const tip = vEl('glossTip');
  function showTip(span) {
    const def = GLOSSARY[span.dataset.term];
    if (!def) return;
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-live', 'polite');
    tip.innerHTML = '<strong>' + esc(span.dataset.term) + '</strong><p>' + esc(def) + '</p>' +
      '<button class="btn small" id="glossClose">Close</button>';
    tip.hidden = false;
    const r = span.getBoundingClientRect();
    tip.style.top = (window.scrollY + r.bottom + 6) + 'px';
    tip.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.innerWidth - 330)) + 'px';
    vEl('glossClose').addEventListener('click', function () { tip.hidden = true; });
  }
  document.addEventListener('click', function (ev) {
    const d = ev.target.closest('.defterm');
    if (d) { ev.stopPropagation(); toggleDefterm(d); return; }
    const g = ev.target.closest('.gloss');
    if (g) { ev.stopPropagation(); showTip(g); return; }
    if (!ev.target.closest('#glossTip')) tip.hidden = true;
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('gloss')) {
      showTip(ev.target);
    }
    if (ev.key === 'Escape') { tip.hidden = true; closeDefterms(); }
  });
  // Wrap node/edge panels so every view gets definitions.
  const _showNode = showNode;
  showNode = function (id) { _showNode(id); markTerms(vEl('panel')); };
  // Static containers rendered once at boot.
  ['clusterCards', 'actionBody', 'impactBody'].forEach(function (id) { markTerms(vEl(id)); });
}

/* ---------------- 3. "Why this connection?" explainer cards ----------------
 * Template-generated from edge + node data only. Never invents facts. */

function explainerHTML(e) {
  const a = nodesById[e.source], b = nodesById[e.target];
  if (!a || !b) return '';
  const an = displayName(a), bn = displayName(b);
  const rel = e.relation;
  let one = '', why = '', caveat = '';

  if (rel === 'shares_pathway' || rel === 'has_mechanism') {
    const mech = a.type === 'mechanism' ? an : (b.type === 'mechanism' ? bn : 'a shared biological pathway');
    one = esc(an) + ' and ' + esc(bn) + ' both involve ' + esc(mech) + '.';
    why = 'When two diseases break the same cellular machinery, research on one \u2014 measurements, lab models, study designs \u2014 may be reusable for the other.';
    caveat = 'Shared machinery does <em>not</em> mean shared treatment. A drug that works for one may fail for the other (for example, if it cannot reach the brain). Therapeutic transfer needs separate proof.';
  } else if (rel === 'variant_of' || rel === 'causal_for') {
    const gene = a.type === 'gene' ? an : bn, dis = a.type === 'gene' ? bn : an;
    one = 'Changes in the ' + esc(gene) + ' gene cause ' + esc(dis) + '.';
    why = 'Knowing the exact gene tells researchers which broken part to target \u2014 and tells families what genetic testing to ask about.';
    caveat = 'Different genes can cause similar symptoms, so the gene matters when choosing or developing a treatment.';
  } else if (rel === 'has_phenotype' || rel === 'presents_with') {
    one = esc(an) + ' can involve ' + esc(bn) + '.';
    why = 'Symptom patterns help doctors recognize the disease early and help families know what to watch for.';
  } else if (rel === 'studied_in') {
    one = esc(bn) + ' studies ' + esc(an) + '.';
    why = 'Trials are where new treatments are tested \u2014 and where families may be able to participate. Check the trial\u2019s official listing for who qualifies.';
  } else if (rel === 'investigates' || rel === 'authored_study_on') {
    const who = a.type === 'researcher' ? an : bn, what = a.type === 'researcher' ? bn : an;
    one = esc(who) + ' researches ' + esc(what) + '.';
    why = 'A potential collaborator \u2014 or simply someone whose published work explains this corner of the science.';
  } else if (rel === 'advocated_by') {
    one = esc(bn) + ' advocates for families affected by ' + esc(an) + '.';
    why = 'Patient organizations fund research, run registries, and connect families who would otherwise face this alone.';
  } else if (rel === 'funds' || rel === 'awarded_to') {
    one = 'Funding connects ' + esc(an) + ' and ' + esc(bn) + '.';
    why = 'Following the funding shows which research programs are active \u2014 and where the gaps are.';
  } else if (rel === 'reuses_asset') {
    one = esc(an) + ' can reuse ' + esc(bn) + '.';
    why = 'Reusing an existing registry, study design, or measurement avoids rebuilding years of work from scratch.';
  } else {
    one = esc(an) + ' is linked to ' + esc(bn) + ' (' + esc(humanize(rel)) + ').';
    why = e.note ? '' : 'See the evidence below for what this link is based on.';
  }

  let html = '<div class="explainer"><h3>Why this connection?</h3>';
  html += '<p class="explainer-one">' + one + '</p>';
  if (why) html += '<p><strong>Why it matters:</strong> ' + esc(why) + '</p>';
  if (caveat) html += '<p class="explainer-caveat"><strong>Important:</strong> ' + caveat + '</p>';
  html += '</div>';
  return html;
}

/* ---------------- 12. Confidence thermometer ---------------- */

function thermoLevel(e) {
  if (e.contradicts) return { pct: 100, cls: 'cracked', label: 'Contested \u2014 evidence points both ways. Treat as an open question.' };
  if (e.evidence === 'inferred') {
    return e.confidence === 'low'
      ? { pct: 18, cls: 'low', label: 'Weak lead \u2014 indirect evidence only. Do not act on this alone.' }
      : { pct: 38, cls: 'low', label: 'A suggestion from analysis \u2014 not yet proven in a study.' };
  }
  if (e.confidence === 'high') {
    const curated = /mondo|hpo|clinvar|orphanet|monarch/.test((e.source_db || '').toLowerCase());
    return curated
      ? { pct: 92, cls: 'high', label: 'Strong \u2014 stated directly by a curated medical database.' }
      : { pct: 80, cls: 'high', label: 'Strong \u2014 directly stated in published research.' };
  }
  return { pct: 55, cls: 'med', label: 'Moderate \u2014 recorded, with limited supporting detail.' };
}

function thermometerHTML(e) {
  const t = thermoLevel(e);
  return '<div class="thermo" title="' + esc(t.label) + '">' +
    '<div class="thermo-track"><div class="thermo-fill thermo-' + t.cls + '" style="width:' + t.pct + '%"></div></div>' +
    '<div class="thermo-label">' + esc(t.label) + '</div></div>';
}

/* ---------------- 14. Second-opinion verification panel ---------------- */

function secondOpinionHTML(e) {
  const ref = linkifyRef(e.source_ref);
  let html = '<details class="verify"><summary>How this claim was verified</summary><ul class="gap-list">';
  if (e.source_quote) {
    html += '<li>A program checked that the quoted sentence appears <strong>word-for-word</strong> in the cited source.</li>' +
      '<li>A second model checked that the quote actually supports the claim as written.</li>';
  } else {
    html += '<li>No verbatim quote was captured for this edge \u2014 it comes from a curated database or registry entry, shown under Source.</li>';
  }
  html += '<li>Confidence \u201c' + esc(e.confidence) + '\u201d means: ' + esc(plainConfidence(e)) + '</li>';
  html += '<li>What could still be wrong: abstracts summarize findings and can omit caveats; database entries reflect their contributors\u2019 evidence; inferred links are analysis, not observation.</li>';
  if (ref) html += '<li><a href="' + esc(ref.url) + '" target="_blank" rel="noopener">Open the source &rarr;</a></li>';
  html += '</ul></details>';
  return html;
}

/* ---------------- edge panel: explainer + thermometer + verification ---------------- */

const _showEdgeV = showEdge;
showEdge = function (e) {
  _showEdgeV(e);
  const panel = vEl('panel');
  const wrap = document.createElement('div');
  wrap.innerHTML = explainerHTML(e) + thermometerHTML(e) + secondOpinionHTML(e);
  panel.insertBefore(wrap, panel.firstChild);
  markTerms(panel);
};

/* ---------------- 15. Family story overlay (honest empty state) ---------------- */

function familyStoryHTML(n) {
  if (n.type !== 'disease' && n.type !== 'phenotype') return '';
  return '<div class="story-box"><span class="story-heart" aria-hidden="true">&#9825;</span> ' +
    '<strong>Family stories</strong><p class="item-sub">No families have shared stories linked here yet. ' +
    'Stories are contributed through partner patient organizations, with consent, and are always kept separate from scientific evidence.</p></div>';
}

/* ---------------- 8. Researcher outreach composer ---------------- */

function outreachHTML(n) {
  const targets = [];
  incidentEdges(n.id).forEach(function (e) {
    if (e.relation !== 'investigates' && e.relation !== 'authored_study_on') return;
    const other = nodesById[e.source === n.id ? e.target : e.source];
    if (other && (other.type === 'disease' || other.type === 'gene') && targets.indexOf(other) === -1) targets.push(other);
  });
  const mechs = [];
  incidentEdges(n.id).forEach(function (e) {
    if (!/mechanism/.test(e.relation || '')) return;
    const other = nodesById[e.source === n.id ? e.target : e.source];
    if (other && other.type === 'mechanism' && mechs.indexOf(other.label) === -1) mechs.push(other.label);
  });
  const focus = targets.slice(0, 3).map(function (t) { return displayName(t); }).join(', ') || 'this area';
  const mechLine = mechs.length ? ' Your work touches ' + mechs.slice(0, 2).join(' and ') + ', which our graph links to related diseases.' : '';
  const draft = 'Subject: Possible collaboration\n\nDear ' + displayName(n) + ',\n\nI found your work through the AI Atlas for Rare Diseases, where you are linked to research on ' + focus + '.' + mechLine +
    '\n\nI work with families affected by a related rare disease, and I am exploring whether methods, measurements, or study designs from your area could transfer to ours.' +
    '\n\nWould you have 20 minutes to discuss whether a collaboration might be feasible?\n\nThank you for your time.\n\n[Your name]\n[Your organization]\n\n\u2014\nConnection viewed in the AI Atlas for Rare Diseases.';
  return '<details class="outreach"><summary>Draft outreach email</summary>' +
    '<p class="item-sub">A starting template filled from the graph. Edit it in your own words before sending.</p>' +
    '<textarea class="outreach-text" rows="12">' + esc(draft) + '</textarea>' +
    '<p><button class="btn small" data-copy>Copy to clipboard</button></p></details>';
}

const _showNodeV = showNode;
showNode = function (id) {
  _showNodeV(id);
  const n = nodesById[id];
  const panel = vEl('panel');
  const extra = document.createElement('div');
  extra.innerHTML = familyStoryHTML(n) + (n.type === 'researcher' ? outreachHTML(n) : '');
  panel.appendChild(extra);
  const copyBtn = extra.querySelector('[data-copy]');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      const ta = extra.querySelector('.outreach-text');
      ta.select();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.value);
        } else { document.execCommand('copy'); }
        copyBtn.textContent = 'Copied \u2713';
      } catch (err) { copyBtn.textContent = 'Select the text to copy'; }
    });
  }
  markTerms(panel);
};

/* ---------------- 7. Clinical trial eligibility helper (honest version) ----------------
 * The graph has no structured eligibility criteria, so this never guesses.
 * It organizes what the family knows, shows what the graph knows, and routes
 * to the official listing for confirmation. */

function initEligibility() {
  new MutationObserver(function () { decorateTrials(); })
    .observe(vEl('actionBody'), { childList: true, subtree: true });
  decorateTrials();
}

function decorateTrials() {
  const body = vEl('actionBody');
  body.querySelectorAll('.action-item').forEach(function (item) {
    if (item.dataset.eligDone) return;
    const link = item.querySelector('a[href*="clinicaltrials.gov"]');
    if (!link) return;
    item.dataset.eligDone = '1';
    const nct = (link.href.match(/NCT\d{8}/i) || link.textContent.match(/NCT\d{8}/i) || [''])[0].toUpperCase();
    const copy = document.createElement('button');
    copy.className = 'btn small'; copy.textContent = 'Copy NCT'; copy.setAttribute('aria-label', 'Copy ' + nct);
    copy.addEventListener('click', async function () {
      try { await navigator.clipboard.writeText(nct); copy.textContent = 'Copied'; }
      catch (err) { copy.textContent = 'Copy manually: ' + nct; }
    });
    link.insertAdjacentElement('afterend', copy);
    const btn = document.createElement('button');
    btn.className = 'btn small elig-btn';
    btn.textContent = 'Prepare eligibility checklist';
    btn.addEventListener('click', function () { toggleEligibility(item, nct, link.href); });
    item.appendChild(btn);
  });
}

function toggleEligibility(item, nct, url) {
  let box = item.querySelector('.elig-box');
  if (box) { box.hidden = !box.hidden; return; }
  box = document.createElement('div');
  box.className = 'elig-box';
  box.innerHTML =
    '<p class="item-sub"><strong>Eligibility helper.</strong> Our data does not include this trial\u2019s ' +
    'eligibility criteria, so we cannot determine eligibility here. Answering these questions prepares you ' +
    'to check the official listing \u2014 which is the only authoritative source.</p>' +
    '<label class="elig-q">Patient age (years) <input type="number" min="0" max="120" class="elig-age text-input" style="width:90px"></label>' +
    '<label class="elig-q">Confirmed genetic diagnosis? <select class="elig-dx"><option value="">Choose&hellip;</option><option>Yes</option><option>No \u2014 clinical diagnosis only</option><option>Not sure</option></select></label>' +
    '<label class="elig-q">Able to travel to a trial site? <select class="elig-travel"><option value="">Choose&hellip;</option><option>Yes</option><option>Maybe</option><option>No</option></select></label>' +
    '<p><button class="btn small elig-go">Prepare my checklist</button></p>' +
    '<div class="elig-out" hidden></div>';
  item.appendChild(box);
  box.querySelector('.elig-go').addEventListener('click', function () {
    const age = box.querySelector('.elig-age').value;
    const dx = box.querySelector('.elig-dx').value;
    const travel = box.querySelector('.elig-travel').value;
    const out = box.querySelector('.elig-out');
    out.hidden = false;
    out.innerHTML = '<h3>Your checklist for ' + esc(nct) + '</h3><ul class="gap-list">' +
      '<li>Age to report: ' + (age ? esc(age) + ' years' : '<em>not entered</em>') + ' \u2014 compare against the trial\u2019s age range on the official listing.</li>' +
      '<li>Diagnosis: ' + (dx ? esc(dx) : '<em>not entered</em>') + ' \u2014 most rare-disease trials require genetic confirmation.</li>' +
      '<li>Travel: ' + (travel ? esc(travel) : '<em>not entered</em>') + ' \u2014 check the trial\u2019s site locations.</li>' +
      '</ul><p><a class="btn small" href="' + esc(url) + '" target="_blank" rel="noopener">Confirm on ClinicalTrials.gov &rarr;</a></p>' +
      '<p class="item-sub">If ClinicalTrials.gov shows an error page, search the ' + esc(nct) + ' number on their homepage &mdash; their site sometimes blocks shared or hotel networks.</p>' +
      '<p class="item-sub">Eligibility can only be confirmed by the trial team. Bring this checklist to the conversation.</p>';
  });
}

/* ---------------- 16. Biotech comparator ---------------- */

function diseaseProfile(id) {
  const n = nodesById[id];
  const genes = [], trials = [], orgs = [], assets = [], mechs = [];
  let recruiting = 0;
  incidentEdges(id).forEach(function (e) {
    const other = nodesById[e.source === id ? e.target : e.source];
    if (!other) return;
    if (other.type === 'gene' && /^(variant_of|causal_for|associated_with|causes)$/.test(e.relation || '') && genes.indexOf(other) === -1) genes.push(other);
    if (other.type === 'mechanism' && mechs.indexOf(other.label) === -1) mechs.push(other.label);
    if (other.type === 'patient_org' && orgs.indexOf(other) === -1) orgs.push(other);
    if (other.type === 'asset' && assets.indexOf(other) === -1) assets.push(other);
    if (other.type === 'trial' && trials.indexOf(other) === -1) {
      trials.push(other);
      if ((other.extra && other.extra.status) === 'RECRUITING') recruiting++;
    }
  });
  const ts = n.extra && n.extra.therapy_status;
  const cluster = GRAPH.clusters.find(function (c) { return c.id === n.cluster_id; });
  return {
    node: n, genes: genes, mechs: mechs, trials: trials.length, recruiting: recruiting,
    orgs: orgs.length, assets: assets.length,
    therapy: (ts && ts.note && !/^[A-Z0-9_\-]+$/.test(ts.note.trim())) ? ts.note : 'Our data does not record a treatment. This does not establish whether approved treatments exist.',
    gaps: cluster && cluster.gaps ? cluster.gaps.length : 0
  };
}

function initCompare() {
  const picker = vEl('comparePicker');
  if (!picker) return;
  const prev = Array.prototype.map.call(picker.querySelectorAll('input:checked'), function (c) { return c.value; });
  const diseases = diseaseOptions();
  picker.innerHTML = '<div class="compare-list">' + diseases.map(function (d) {
    return '<label class="check"><input type="checkbox" value="' + esc(d.id) + '"> ' + esc(displayName(d)) + '</label>';
  }).join('') + '</div><p><button class="btn" id="compareGo">Compare selected</button> <span class="item-sub">Pick 2\u20135 diseases.</span></p>';
  prev.forEach(function (id) {
    const cb = picker.querySelector('input[value="' + id + '"]');
    if (cb) cb.checked = true;
  });
  vEl('compareGo').addEventListener('click', function () {
    const sel = Array.from(picker.querySelectorAll('input:checked')).map(function (c) { return c.value; }).slice(0, 5);
    renderCompare(sel);
  });
}

function renderCompare(ids) {
  const body = vEl('compareBody');
  if (ids.length < 2) { body.innerHTML = '<p class="section-lede">Select at least two diseases above to compare.</p><p><button class="btn" id="compareBack">Back to selection</button></p>'; vEl('compareBack').addEventListener('click', function () { vEl('comparePicker').scrollIntoView({ behavior: 'smooth' }); }); return; }
  const profs = ids.map(diseaseProfile);
  function row(label, fn) {
    return '<tr><th>' + esc(label) + '</th>' + profs.map(function (p) {
      return '<td>' + fn(p) + '</td>';
    }).join('') + '</tr>';
  }
  body.innerHTML = '<div class="table-scroll"><table class="compare-table"><caption class="sr-only">Comparison of ' + ids.length + ' diseases</caption><thead><tr><th scope="col"></th>' +
    profs.map(function (p) { return '<th>' + esc(displayName(p.node)) + '</th>'; }).join('') +
    '</tr></thead><tbody>' +
    row('Gene target(s)', function (p) { return esc(p.genes.map(function (g) { return displayName(g); }).join(', ') || 'not recorded'); }) +
    row('Mechanism(s)', function (p) { return esc(p.mechs.join('; ') || 'not recorded'); }) +
    row('Trials linked', function (p) { return p.trials + ' (' + p.recruiting + ' recruiting)'; }) +
    row('Patient orgs', function (p) { return String(p.orgs); }) +
    row('Reusable assets', function (p) { return String(p.assets); }) +
    row('Therapy landscape', function (p) { return esc(p.therapy.slice(0, 160)); }) +
    row('Open gaps (cluster)', function (p) { return String(p.gaps); }) +
    '</tbody></table></div>' +
    '<p class="item-sub">All cells derive from graph data. Population sizes and regulatory precedent are not in the current slice.</p>';
}

/* ---------------- 9. Shared assets library ---------------- */

function initAssets() {
  const body = vEl('assetsBody');
  const input = vEl('assetSearch');
  if (!body || !input) return;
  if (input.dataset.done === '1') return;
  input.dataset.done = '1';
  function render() {
    const q = input.value.trim().toLowerCase();
    const assets = GRAPH.nodes.filter(function (n) {
      if (n.type !== 'asset') return false;
      if (!q) return true;
      return (n.label + ' ' + (n.description || '')).toLowerCase().indexOf(q) !== -1;
    });
    if (!assets.length) { body.innerHTML = '<p class="section-lede">No assets match.</p>'; return; }
    body.innerHTML = assets.map(function (a) {
      const diseases = [];
      incidentEdges(a.id).forEach(function (e) {
        const other = nodesById[e.source === a.id ? e.target : e.source];
        if (other && other.type === 'disease' && diseases.indexOf(other) === -1) diseases.push(other);
      });
      const stage = (a.extra && a.extra.stage) || '';
      return '<article class="card"><h2>' + esc(displayName(a)) + '</h2>' +
        (stage ? '<div class="count">Stage: ' + esc(humanize(stage)) + '</div>' : '') +
        '<p>' + esc((a.description || '').slice(0, 260)) + '</p>' +
        (diseases.length ? '<div class="kv-line"><strong>Linked diseases:</strong> ' +
          diseases.slice(0, 6).map(function (d) { return esc(displayName(d)); }).join(', ') + '</div>' : '') +
        '</article>';
    }).join('');
    markTerms(body);
  }
  input.addEventListener('input', render);
  render();
}

/* ---------------- 11. Night mode ---------------- */

function initNightMode() {
  const btn = vEl('nightToggle');
  let on = false;
  try { on = localStorage.getItem('atlas_night') === '1'; } catch (err) {}
  function apply() {
    document.body.classList.toggle('dark', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'Day mode' : 'Night mode';
    try { localStorage.setItem('atlas_night', on ? '1' : '0'); } catch (err) {}
  }
  // Auto-enable for small screens during night hours (Devon at 2am).
  try {
    if (!localStorage.getItem('atlas_night') && window.innerWidth <= 700) {
      const h = new Date().getHours();
      if (h >= 21 || h < 6) on = true;
    }
  } catch (err) {}
  btn.addEventListener('click', function () { on = !on; apply(); });
  apply();
}

/* ---------------- 17. Accessibility subset ---------------- */

function initA11y() {
  const btn = vEl('a11yToggle');
  if (!btn || btn.dataset.a11yBound) return;
  btn.dataset.a11yBound = '1';
  const panel = document.createElement('div');
  panel.id = 'a11yPanel'; panel.className = 'a11y-panel'; panel.hidden = true;
  panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Accessibility settings');
  panel.innerHTML = '<div class="action-head"><h3>Accessibility</h3><button type="button" class="btn small" id="a11yClose">Close</button></div>' +
    '<label class="check"><input type="checkbox" id="a11yDys"> Dyslexia-friendly text</label>' +
    '<label class="check"><input type="checkbox" id="a11yMotion"> Reduce motion</label>' +
    '<label class="check"><input type="checkbox" id="a11yFocus"> Focus mode (hide secondary navigation and decoration)</label>' +
    '<label class="check"><input type="checkbox" id="a11yLarge"> Larger text</label>';
  document.querySelector('.topbar').appendChild(panel);
  btn.setAttribute('aria-controls', panel.id);
  function setOpen(open, restoreFocus) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-pressed', String(open));
    if (restoreFocus) btn.focus();
  }
  setOpen(false);
  btn.addEventListener('click', function () { setOpen(panel.hidden); });
  vEl('a11yClose').addEventListener('click', function () { setOpen(false, true); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !panel.hidden) setOpen(false, true);
  });
  document.addEventListener('click', function (ev) {
    if (!panel.hidden && !panel.contains(ev.target) && !btn.contains(ev.target)) setOpen(false);
  });
  const options = { a11yDys: 'a11y-dys', a11yMotion: 'a11y-motion', a11yFocus: 'a11y-focus', a11yLarge: 'a11y-large' };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('atlas-a11y') || '{}') || {}; } catch (err) {}
  Object.keys(options).forEach(function (id) {
    const input = vEl(id), cls = options[id];
    input.checked = saved[cls] === true;
    document.body.classList.toggle(cls, input.checked);
    input.addEventListener('change', function () {
      document.body.classList.toggle(cls, input.checked); saved[cls] = input.checked;
      try { localStorage.setItem('atlas-a11y', JSON.stringify(saved)); } catch (err) {}
    });
  });
}
