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

function viewsBoot() {
  if (!window.__atlasReady || !GRAPH) { setTimeout(viewsBoot, 250); return; }
  initStartTab();
  initContradictions();
  initRecent();
  initGaps();
  initSubway();
  initReading();
  initGlossary();
  initEligibility();
  initOutreach();
  initCompare();
  initAssets();
  initJourneyBuilder();
  initNightMode();
  initA11y();
  // Mobile: persona entry is the landing page on narrow screens.
  if (window.innerWidth <= 700 && state.tab === 'explore') switchTab('start');
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
    desc: 'Browse mechanism clusters to see which disease groups share biology your approach could address.',
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
    .filter(function (n) { return n.type === 'disease'; })
    .sort(function (a, b) { return displayName(a).localeCompare(displayName(b)); });
}

function initStartTab() {
  const grid = vEl('personaGrid');
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
  else if (pid === 'osei') { switchTab('explore'); setTimeout(function(){ vEl('search').focus(); }, 50); }
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
          if (sel) { sel.value = id; sel.dispatchEvent(new Event('change')); }
          switchTab('action');
        } else if (go === 'explore') {
          state.center = id; switchTab('explore'); renderExplore();
        } else if (go === 'journey') { switchTab('journey'); }
      });
    });
  }

  input.addEventListener('input', function () {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { sug.hidden = true; return; }
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
    if (ev.key === 'Enter') {
      const first = sug.querySelector('.sug[data-i], .sug[data-fuzzy]');
      if (first) { ev.preventDefault(); first.click(); }
    }
    if (ev.key === 'Escape') sug.hidden = true;
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

function renderRecent() {
  const body = vEl('recentBody');
  const list = recentEdges();
  vEl('recentStats').textContent = list.length + ' findings';
  if (!list.length) {
    body.innerHTML = '<p class="section-lede">No findings in this window yet.</p>';
    return;
  }
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
}

/* ---------------- 10. Honest Gaps dashboard ---------------- */

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
  html += '<article class="card"><h2>Thinly covered diseases</h2><p>Diseases with the fewest linked papers and trials in this slice. Treat conclusions about them as preliminary.</p><ul class="gap-list">' +
    thin.map(function (t) {
      return '<li><strong>' + esc(displayName(t.d)) + '</strong> &mdash; ' + t.lit + ' linked sources, ' + t.tr + ' trials, ' + t.org + ' patient orgs</li>';
    }).join('') + '</ul></article>';

  html += '<article class="card"><h2>Source limitations</h2><ul class="gap-list">' +
    '<li>Literature extraction covers <strong>abstracts only</strong> &mdash; full text may hold additional evidence.</li>' +
    '<li><strong>OMIM was excluded</strong> (requires an API key); ClinVar and Monarch cover gene&ndash;disease links instead.</li>' +
    '<li>Trial records reflect registry snapshots; status may have changed since ingestion.</li>' +
    '<li>Preprints have not been peer-reviewed; they are labeled as such wherever they appear.</li>' +
    '</ul></article>';

  const lowConf = GRAPH.edges.filter(function (e) { return e.evidence === 'inferred' && e.confidence === 'low'; }).length;
  html += '<article class="card"><h2>Low-confidence regions</h2><p><strong>' + lowConf +
    '</strong> edges are flagged inferred + low &mdash; the weakest derivations in the graph. They are kept visible and labeled, never hidden.</p>' +
    '<p class="item-sub">Rule of thumb: treat inferred links as leads to investigate, not facts to act on.</p></article>';

  const years = GRAPH.edges.map(function (e) { return parseInt(e.publication_year, 10) || 0; }).filter(Boolean);
  const maxY = years.length ? Math.max.apply(null, years) : null;
  html += '<article class="card"><h2>Recency</h2>' +
    (maxY ? '<p>Newest literature edge in the graph is from <strong>' + maxY + '</strong>. Anything published after ingestion is missing &mdash; use the Recent tab to see the coverage window.</p>'
          : '<p>No publication years recorded on literature edges.</p>') + '</article>';
  html += '</div>';
  body.innerHTML = html;
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

/* Plain-language rewrites of Maria's journey "why" texts. Faithful
 * simplifications of the originals — no new facts introduced. */
const PLAIN_WHY = [
  'Sanfilippo A is a rare brain disease in children. A new gene therapy called Fayuvi was approved in September 2026, but only for young children whose development is still on track. The urgent question for families: who qualifies \u2014 and what is the path for everyone else?',
  'The SGSH gene carries instructions for an enzyme that cleans up waste inside brain cells. When this gene is broken, the waste piles up and causes Sanfilippo A.',
  'The broken enzyme is one step in the cell\u2019s recycling system for a substance called heparan sulfate. Other diseases break different steps of the same recycling system \u2014 so their research may overlap.',
  'MPS I is a related disease with a similar recycling problem. It has had an approved enzyme treatment since 2003 and a published patient registry researchers can learn from. But its treatment helps the body, not the brain \u2014 so it cannot simply be assumed to work for Sanfilippo.',
  'MPS II (Hunter syndrome) is another related disease, with an approved treatment since 2006. Its large patient registry worked out practical rules for consent and tracking treatment \u2014 rules Sanfilippo researchers could reuse instead of inventing their own.',
  'The National MPS Society supports families affected by MPS I, II, and III. It is a natural convenor to bring these communities together around a shared research plan.',
  'Instead of designing a patient study from scratch, researchers can reuse the public MPS I/II registry design \u2014 then adjust it for Sanfilippo\u2019s diagnosis, ages, and brain symptoms. Note: the study design is public, but patients\u2019 data is not.',
  'The concrete next step: a clinician-led study that follows Sanfilippo patients over time, with clear rules for who can join and measurements focused on the brain \u2014 keeping treated and untreated patients in separate groups so the results are honest.'
];

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
  'clinical trial': 'A research study testing a treatment in people, run in phases with strict safety monitoring.',
  'phase 1': 'The first trial phase: mainly tests safety in a small group.',
  'phase 2': 'The second trial phase: tests whether the treatment works, in a larger group.',
  'phase 3': 'The final trial phase before approval: compares the treatment against standard care in a large group.',
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

function initReading() {
  document.querySelectorAll('[data-reading]').forEach(function (btn) {
    const on = btn.dataset.reading === reading;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.addEventListener('click', function () { setReading(btn.dataset.reading); });
  });
  new MutationObserver(function () { applyReading(); })
    .observe(vEl('stepPanel'), { childList: true });
  applyReading();
}

function setReading(r) {
  reading = r;
  try { localStorage.setItem(READING_KEY, r); } catch (err) {}
  document.querySelectorAll('[data-reading]').forEach(function (btn) {
    const on = btn.dataset.reading === r;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  applyReading();
}

function applyReading() {
  const sp = vEl('stepPanel');
  if (!sp) return;
  const whyEl = sp.querySelector('.why');
  if (!whyEl) return;
  if (!whyEl.dataset.orig) whyEl.dataset.orig = whyEl.textContent;
  const i = state.journeyStep;
  if (reading === 'plain' && PLAIN_WHY[i]) {
    whyEl.textContent = PLAIN_WHY[i];
  } else if (reading === 'detailed') {
    let extra = '';
    try {
      const steps = journeySteps();
      if (i > 0 && steps[i]) {
        const e = edgeBetween(steps[i - 1].node, steps[i].node);
        if (e) {
          extra = ' [Link: ' + humanize(e.relation) +
            (e.evidence_type ? ' \u00b7 ' + evidenceLabel(e.evidence_type) : '') +
            (e.publication_year ? ' \u00b7 ' + e.publication_year : '') +
            ' \u00b7 confidence ' + e.confidence + ']';
        }
      }
    } catch (err) {}
    whyEl.textContent = whyEl.dataset.orig + extra;
  } else {
    whyEl.textContent = whyEl.dataset.orig;
  }
}

/* ---------------- glossary: tap-to-define ---------------- */

function isWordBoundary(low, idx, len) {
  const before = idx === 0 ? ' ' : low.charAt(idx - 1);
  const after = idx + len >= low.length ? ' ' : low.charAt(idx + len);
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

function markTerms(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p || p.closest('.gloss, script, style, a, button, input, select, textarea, .suggestions')) {
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
      for (let k = 0; k < GLOSS_KEYS.length; k++) {
        const key = GLOSS_KEYS[k];
        const idx = low.indexOf(key, pos);
        if (idx !== -1 && isWordBoundary(low, idx, key.length) &&
            (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && key.length > best.length))) {
          best = key; bestIdx = idx;
        }
      }
      if (best === null) break;
      found = true;
      frag.appendChild(document.createTextNode(text.slice(pos, bestIdx)));
      const span = document.createElement('span');
      span.className = 'gloss';
      span.dataset.term = best;
      span.textContent = text.slice(bestIdx, bestIdx + best.length);
      span.setAttribute('tabindex', '0');
      span.setAttribute('role', 'button');
      span.setAttribute('aria-label', best + ': tap for definition');
      frag.appendChild(span);
      pos = bestIdx + best.length;
      low = low; // unchanged; text unchanged
    }
    if (!found) return;
    frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag, node);
  });
}

function initGlossary() {
  const tip = vEl('glossTip');
  function showTip(span) {
    const def = GLOSSARY[span.dataset.term];
    if (!def) return;
    tip.innerHTML = '<strong>' + esc(span.dataset.term) + '</strong><p>' + esc(def) + '</p>' +
      '<button class="btn small" id="glossClose">Close</button>';
    tip.hidden = false;
    const r = span.getBoundingClientRect();
    tip.style.top = (window.scrollY + r.bottom + 6) + 'px';
    tip.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.innerWidth - 330)) + 'px';
    vEl('glossClose').addEventListener('click', function () { tip.hidden = true; });
  }
  document.addEventListener('click', function (ev) {
    const g = ev.target.closest('.gloss');
    if (g) { ev.stopPropagation(); showTip(g); return; }
    if (!ev.target.closest('#glossTip')) tip.hidden = true;
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('gloss')) {
      showTip(ev.target);
    }
    if (ev.key === 'Escape') tip.hidden = true;
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
    const nct = link.textContent.trim();
    const btn = document.createElement('button');
    btn.className = 'btn small elig-btn';
    btn.textContent = 'Check eligibility';
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
    if (other.type === 'gene' && genes.indexOf(other) === -1) genes.push(other);
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
    therapy: ts && ts.note ? ts.note : 'No approved therapy recorded in the graph.',
    gaps: cluster && cluster.gaps ? cluster.gaps.length : 0
  };
}

function initCompare() {
  const picker = vEl('comparePicker');
  const diseases = diseaseOptions();
  picker.innerHTML = '<div class="compare-list">' + diseases.map(function (d) {
    return '<label class="check"><input type="checkbox" value="' + esc(d.id) + '"> ' + esc(displayName(d)) + '</label>';
  }).join('') + '</div><p><button class="btn" id="compareGo">Compare selected</button> <span class="item-sub">Pick 2\u20135 diseases.</span></p>';
  vEl('compareGo').addEventListener('click', function () {
    const sel = Array.from(picker.querySelectorAll('input:checked')).map(function (c) { return c.value; }).slice(0, 5);
    renderCompare(sel);
  });
}

function renderCompare(ids) {
  const body = vEl('compareBody');
  if (ids.length < 2) { body.innerHTML = '<p class="section-lede">Select at least two diseases to compare.</p>'; return; }
  const profs = ids.map(diseaseProfile);
  function row(label, fn) {
    return '<tr><th>' + esc(label) + '</th>' + profs.map(function (p) {
      return '<td>' + fn(p) + '</td>';
    }).join('') + '</tr>';
  }
  body.innerHTML = '<div class="table-scroll"><table class="compare-table"><thead><tr><th></th>' +
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

/* ---------------- 13. Journey builder for other diseases ---------------- */

function initJourneyBuilder() {
  vEl('buildJourneyBtn').addEventListener('click', function () {
    const jb = vEl('journeyBuilder');
    jb.hidden = !jb.hidden;
    if (!jb.hidden && !jb.dataset.built) {
      jb.dataset.built = '1';
      jb.innerHTML = '<h3>Build a journey for another disease</h3>' +
        '<p class="section-lede">Generates a narrative from graph data \u2014 treatment landscape, natural allies, reusable research, and a suggested next step. Anything the graph does not know is labeled as unknown.</p>' +
        '<div class="action-head"><select id="jbDisease">' +
        diseaseOptions().map(function (d) {
          return '<option value="' + esc(d.id) + '">' + esc(displayName(d)) + '</option>';
        }).join('') + '</select> <button class="btn" id="jbGo">Build journey</button></div>' +
        '<div id="jbOut"></div>';
      vEl('jbGo').addEventListener('click', function () { renderBuiltJourney(vEl('jbDisease').value); });
    }
  });
}

function renderBuiltJourney(id) {
  const out = vEl('jbOut');
  const p = diseaseProfile(id);
  const n = p.node;
  const allies = [];
  incidentEdges(id).forEach(function (e) {
    if (e.relation !== 'shares_pathway') return;
    const other = nodesById[e.source === id ? e.target : e.source];
    if (other && other.type === 'disease' && allies.indexOf(other) === -1) allies.push(other);
  });
  const cluster = GRAPH.clusters.find(function (c) { return c.id === n.cluster_id; });
  let html = '<article class="card journey-built"><h2>A journey for ' + esc(displayName(n)) + '</h2>';
  html += '<h3>1. The disease</h3><p>' + esc(displayName(n)) +
    (p.genes.length ? ' is linked to the ' + esc(p.genes.map(function (g) { return displayName(g); }).join(', ')) + ' gene' + (p.genes.length > 1 ? 's' : '') + '.' : ' has no gene link recorded in this slice.') +
    (p.mechs.length ? ' It involves ' + esc(p.mechs.join('; ')) + '.' : '') + '</p>';
  html += '<h3>2. Treatment landscape</h3><p>' + esc(p.therapy) + '</p>';
  html += '<h3>3. Natural allies</h3>' +
    (allies.length ? '<p>Diseases sharing a pathway: ' + allies.slice(0, 5).map(function (a) { return esc(displayName(a)); }).join(', ') + '. Their communities and researchers are the first place to look for shared work.</p>'
                   : '<p>No pathway-sharing diseases recorded for ' + esc(displayName(n)) + ' in this slice \u2014 an honest gap.</p>');
  html += '<h3>4. Existing research that could help</h3><p>' + p.trials + ' linked trials (' + p.recruiting + ' recruiting), ' +
    p.assets + ' reusable assets, ' + p.orgs + ' patient organizations in the graph.</p>';
  html += '<h3>5. Suggested next step</h3><p>' +
    (cluster && cluster.next_experiment ? esc(cluster.next_experiment)
      : 'Map what exists: confirm the gene, find the patient community, and check whether a natural-history study design from a neighboring disease can be adapted.') + '</p>';
  html += '<p class="item-sub">Generated from graph data on ' + esc(new Date().toISOString().slice(0, 10)) + '. Verify each link before acting.</p></article>';
  out.innerHTML = html;
  markTerms(out);
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
  let panel = vEl('a11yPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'a11yPanel';
    panel.className = 'a11y-panel';
    panel.hidden = true;
    panel.innerHTML =
      '<h3>Accessibility</h3>' +
      '<label class="check"><input type="checkbox" id="a11yDys"> Easier-to-read text (wider spacing, simpler letterforms)</label>' +
      '<label class="check"><input type="checkbox" id="a11yMotion"> Reduce motion</label>' +
      '<label class="check"><input type="checkbox" id="a11yFocus"> Focus mode (hide navigation, one thing at a time)</label>' +
      '<p><button class="btn small" id="a11yPrint">Print-friendly view</button></p>' +
      '<p class="item-sub">Medical terms are underlined throughout the atlas \u2014 tap any of them for a plain-language definition.</p>';
    document.querySelector('.topbar').appendChild(panel);
  }
  btn.addEventListener('click', function () {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-pressed', panel.hidden ? 'false' : 'true');
  });
  vEl('a11yDys').addEventListener('change', function (ev) {
    document.body.classList.toggle('a11y-dys', ev.target.checked);
  });
  vEl('a11yMotion').addEventListener('change', function (ev) {
    document.body.classList.toggle('a11y-motion', ev.target.checked);
  });
  vEl('a11yFocus').addEventListener('change', function (ev) {
    document.body.classList.toggle('a11y-focus', ev.target.checked);
  });
  vEl('a11yPrint').addEventListener('click', function () { window.print(); });
}
