/* AI Atlas for Rare Diseases — static single-page UI.
 * Reads site/graph.json (loaded via fetch('./graph.json')), renders with vis-network.
 * All cluster/journey/neighborhood derivations happen at runtime from the data.
 */
'use strict';

let GRAPH = null;
const nodesById = {};
const edgesOut = {};   // nodeId -> [edgeIdx]
const edgesIn = {};
const synToId = {};    // lowercased synonym -> nodeId
const synOrig = {};    // lowercased synonym -> original-cased synonym
const CONF_WIDTH = { high: 2, medium: 1.5, low: 1 };

// Plain-language confidence: what the badge actually means for a non-scientist.
function plainConfidence(e) {
  const src = (e.source_db || '').toLowerCase();
  const curated = /mondo|hpo|clinvar|orphanet|monarch/.test(src);
  if (e.evidence === 'inferred') {
    return e.confidence === 'low'
      ? 'Weak or indirect evidence — treat as a lead, not a fact.'
      : 'Our analysis suggests this link — not yet proven in a study.';
  }
  if (e.confidence === 'high') {
    return curated
      ? 'Stated directly by a curated medical database.'
      : 'Directly stated in a published paper.';
  }
  if (/clinicaltrials/.test(src)) {
    return 'A trial is registered, but results are not shown here.';
  }
  return 'Recorded in a database, with limited supporting detail.';
}

const EVIDENCE_RANK = {
  meta_analysis: 6, RCT: 5, observational: 4,
  case_series: 3, case_report: 2, review: 1, preprint: 0, other: 0
};
function evidenceLabel(t) {
  return { meta_analysis: 'meta-analysis', RCT: 'randomized trial',
    observational: 'observational study', case_series: 'case series',
    case_report: 'case report', review: 'review', preprint: 'preprint',
    other: 'other' }[t] || t;
}

// Restrained palette: low-saturation categorical colors, one accent for selection.
const TYPE_COLORS = {
  disease:     '#2563eb',
  gene:        '#0d9488',
  variant:     '#64748b',
  phenotype:   '#94a3b8',
  trial:       '#c2410c',
  patient_org: '#6d5fc0',
  researcher:  '#a16207',
  mechanism:   '#334155',
  asset:       '#0f766e',
  funding:     '#b45309',
  paper:       '#525252'
};
const ACCENT = '#1a56db';
const EDGE_COLOR = '#c4c9d1';
const CONTRADICT_COLOR = '#d97777';

const state = {
  tab: 'explore',
  center: null,
  hops: 1,
  clusterOnly: false,
  recentOnly: false,
  strongOnly: false,
  journeyStep: 0
};

let net = null;        // explore vis-network
let journeyNet = null;  // journey vis-network

/* ---------------- helpers ---------------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function el(id) { return document.getElementById(id); }

function linkifyRef(ref) {
  if (!ref) return null;
  const r = String(ref).trim();
  let m = r.match(/^PMID:(\d+)$/i);
  if (m) return { url: 'https://pubmed.ncbi.nlm.nih.gov/' + m[1] + '/', label: r };
  m = r.match(/^(NCT\d+)$/i);
  if (m) return { url: 'https://clinicaltrials.gov/study/' + m[1] + '/', label: r };
  m = r.match(/^RePORTER:(\d+)$/i);
  if (m) return { url: 'https://reporter.nih.gov/project-details/' + m[1], label: r };
  if (/^https?:\/\//i.test(r)) return { url: r, label: r.length > 60 ? r.slice(0, 57) + '...' : r };
  return null;
}

/* Friendly display name derived from the node's own synonyms, e.g.
 * "Sanfilippo A (MPS IIIA)". Never hardcoded: computed from data. */
function displayName(n) {
  if (!n) return '';
  const label = n.label || n.id;
  if (n.type === 'gene') return label; // HGNC symbols (SGSH, GBA1) are the recognizable name
  const cands = (n.synonyms || []).filter(function (s) {
    return s && s.toLowerCase() !== label.toLowerCase() && s.length <= 40;
  });
  if (!cands.length) return label;
  const words = cands.filter(function (s) { return /[a-z]/.test(s) && /\s/.test(s); });
  const codes = cands.filter(function (s) {
    // All-caps short tokens: acronyms with digits (MPS3A) or Roman numerals (MPS IIIA).
    return !/[a-z]/.test(s) && /^[A-Z0-9][A-Z0-9().\-\s]{1,19}$/.test(s);
  });
  const name = words.length ? words[0] : (codes.length ? codes[0] : label);
  const spaced = codes.filter(function (s) { return /\s/.test(s); });
  const code = spaced.length ? spaced[spaced.length - 1] : (codes.length ? codes[codes.length - 1] : null);
  if (name !== label && code && code.toLowerCase() !== name.toLowerCase()) {
    return name + ' (' + code + ')';
  }
  return name;
}

function shortLabel(n, max) {
  max = max || 30;
  const d = displayName(n);
  return d.length > max ? d.slice(0, max - 1) + '...' : d;
}

function humanize(s) {
  return String(s || '').replace(/_/g, ' ');
}

function neighborsOf(id) {
  const out = new Set();
  (edgesOut[id] || []).forEach(function (i) { out.add(GRAPH.edges[i].target); });
  (edgesIn[id] || []).forEach(function (i) { out.add(GRAPH.edges[i].source); });
  return out;
}

function incidentEdges(id) {
  const seen = new Set();
  const out = [];
  (edgesOut[id] || []).concat(edgesIn[id] || []).forEach(function (i) {
    if (!seen.has(i)) { seen.add(i); out.push(GRAPH.edges[i]); }
  });
  return out;
}

/* ---------------- boot ---------------- */

fetch('./graph.json')
  .then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function (g) {
    GRAPH = g;
    buildIndices();
    init();
  })
  .catch(function (err) {
    el('loading').textContent = 'Could not load graph.json: ' + err.message +
      ' (serve this folder over HTTP, e.g. python3 -m http.server).';
  });

function buildIndices() {
  GRAPH.nodes.forEach(function (n) {
    nodesById[n.id] = n;
  });
  GRAPH.edges.forEach(function (e, i) {
    (edgesOut[e.source] = edgesOut[e.source] || []).push(i);
    (edgesIn[e.target] = edgesIn[e.target] || []).push(i);
  });
  Object.keys(GRAPH.synonyms || {}).forEach(function (key) {
    const low = key.toLowerCase();
    synToId[low] = GRAPH.synonyms[key];
    synOrig[low] = key;
  });
}

function init() {
  el('loading').style.display = 'none';
  el('graphMeta').textContent =
    GRAPH.nodes.length.toLocaleString() + ' nodes · ' +
    GRAPH.edges.length.toLocaleString() + ' edges · ' +
    GRAPH.clusters.length + ' mechanism clusters';
  el('footerStats').textContent =
    'Slice: ' + (GRAPH.meta && GRAPH.meta.slice ? GRAPH.meta.slice : 'rare diseases') + '.';

  buildTypeLegend();
  initSearch();
  initExploreControls();
  initTabs();
  initClusters();
  initPatientAction();
  initJourney();
  initImpact();

  // Default: Maria's disease (journey start), 1-hop neighborhood — the demo entry point.
  const start = (GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.start) || null;
  state.center = start;
  renderExplore();
  el('search').focus();

  // Debug/test handle (harmless in production): lets automated checks drive the UI.
  window.__atlas = {
    state: state,
    getNet: function () { return net; },
    showNode: showNode, showEdge: showEdge,
    stepTo: stepTo, renderExplore: renderExplore, switchTab: switchTab
  };
  window.__atlasReady = true;
}

/* ---------------- tabs ---------------- */

function initTabs() {
  document.querySelectorAll('.tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });
}

function switchTab(name) {
  state.tab = name;
  document.querySelectorAll('.tabs button').forEach(function (btn) {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.view').forEach(function (v) { v.hidden = true; });
  el('view-' + name).hidden = false;
  if (name === 'journey') {
    // Rebuild the journey canvas after it becomes visible so vis can measure it.
    renderJourneyStep(state.journeyStep);
  }
}

/* ---------------- search ---------------- */

function initSearch() {
  const input = el('search');
  const box = el('suggestions');
  let items = [];

  function search(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) { box.hidden = true; items = []; return; }
    const scored = [];
    const seen = new Set();
    Object.keys(synToId).forEach(function (key) {
      if (seen.size > 400 && !key.startsWith(q)) return;
      const id = synToId[key];
      if (seen.has(id)) return;
      if (key.startsWith(q)) { scored.push([0, key, id]); seen.add(id); }
      else if (scored.length < 60 && key.indexOf(q) !== -1) { scored.push([1, key, id]); seen.add(id); }
    });
    scored.sort(function (a, b) { return a[0] - b[0] || a[1].localeCompare(b[1]); });
    items = scored.slice(0, 8);
    if (!items.length) { box.hidden = true; return; }
    box.innerHTML = items.map(function (it, i) {
      const n = nodesById[it[2]];
      return '<button class="sug' + (i === 0 ? ' highlight' : '') + '" data-i="' + i + '">' +
        '<span class="sug-type">' + esc(humanize(n.type)) + '</span>' +
        '<span class="sug-name">' + esc(displayName(n)) + '</span>' +
        '<span class="sug-sub">matched &ldquo;' + esc(synOrig[it[1]]) + '&rdquo;</span>' +
        '</button>';
    }).join('');
    box.hidden = false;
    box.querySelectorAll('.sug').forEach(function (b) {
      b.addEventListener('click', function () { pick(items[Number(b.dataset.i)][2]); });
    });
  }

  function pick(id) {
    box.hidden = true;
    input.value = '';
    state.center = id;
    state.hops = 1; state.clusterOnly = false;
    el('hops1').classList.add('active'); el('hops2').classList.remove('active');
    el('clusterOnly').checked = false;
    if (state.tab !== 'explore') switchTab('explore');
    renderExplore();
  }

  input.addEventListener('input', function () { search(input.value); });
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && items.length) { ev.preventDefault(); pick(items[0][2]); }
    if (ev.key === 'Escape') { box.hidden = true; }
  });
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('.searchbar')) box.hidden = true;
  });
}

/* ---------------- explore ---------------- */

function initExploreControls() {
  el('hops1').addEventListener('click', function () { setHops(1); });
  el('hops2').addEventListener('click', function () { setHops(2); });
  el('clusterOnly').addEventListener('change', function (ev) {
    state.clusterOnly = ev.target.checked;
    renderExplore();
  });
  el('recentOnly').addEventListener('change', function (ev) {
    state.recentOnly = ev.target.checked;
    renderExplore();
  });
  el('strongOnly').addEventListener('change', function (ev) {
    state.strongOnly = ev.target.checked;
    renderExplore();
  });
}

/* Evidence filters apply only to literature-sourced edges (those carrying
 * publication_year/evidence_type). Curated ontology edges always pass. */
function passesEvidenceFilter(e) {
  if (state.recentOnly && e.publication_year) {
    const y = parseInt(e.publication_year, 10);
    if (y && y < new Date().getFullYear() - 5) return false;
  }
  if (state.strongOnly && e.evidence_type) {
    if ((EVIDENCE_RANK[e.evidence_type] || 0) < 5) return false;
  }
  return true;
}

function setHops(h) {
  state.hops = h;
  el('hops1').classList.toggle('active', h === 1);
  el('hops2').classList.toggle('active', h === 1 ? false : true);
  el('hops1').setAttribute('aria-checked', h === 1 ? 'true' : 'false');
  el('hops2').setAttribute('aria-checked', h === 2 ? 'true' : 'false');
  renderExplore();
}

function buildTypeLegend() {
  const types = Object.keys(TYPE_COLORS).filter(function (t) {
    return GRAPH.nodes.some(function (n) { return n.type === t; });
  });
  const legend = document.createElement('span');
  legend.id = 'typeLegend';
  legend.innerHTML = types.map(function (t) {
    return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;' +
      'background:' + TYPE_COLORS[t] + ';margin:0 4px 0 10px"></span>' + esc(humanize(t));
  }).join('');
  const anchor = el('viewStats');
  anchor.parentNode.insertBefore(legend, anchor.nextSibling);
}

function neighborhood(centerId, hops) {
  const ids = new Set([centerId]);
  let frontier = new Set([centerId]);
  for (let h = 0; h < hops; h++) {
    const next = new Set();
    frontier.forEach(function (id) {
      neighborsOf(id).forEach(function (nb) {
        if (!ids.has(nb)) { ids.add(nb); next.add(nb); }
      });
    });
    frontier = next;
    if (!frontier.size) break;
  }
  return ids;
}

/* explicitIds: load a fixed set (cluster members); truncates at CAP with a note. */
function renderExplore(explicitIds, note) {
  const center = state.center;
  let ids;
  if (explicitIds) {
    ids = new Set(explicitIds);
  } else if (center && nodesById[center]) {
    ids = neighborhood(center, state.hops);
    if (state.clusterOnly) {
      const cid = nodesById[center].cluster_id;
      ids = new Set(Array.from(ids).filter(function (id) {
        return nodesById[id] && nodesById[id].cluster_id === cid;
      }));
      ids.add(center);
    }
  } else {
    ids = new Set();
  }

  let truncated = 0;
  if (ids.size > 150) {
    // Deterministic cap: keep highest-degree nodes first.
    const degree = {};
    ids.forEach(function (id) { degree[id] = (edgesOut[id] || []).length + (edgesIn[id] || []).length; });
    const sorted = Array.from(ids).sort(function (a, b) { return degree[b] - degree[a]; });
    truncated = ids.size - 150;
    ids = new Set(sorted.slice(0, 150));
    if (center) ids.add(center);
  }

  const edgeList = GRAPH.edges.filter(function (e) {
    return ids.has(e.source) && ids.has(e.target) && passesEvidenceFilter(e);
  });

  const visNodes = new vis.DataSet(Array.from(ids).map(function (id) {
    const n = nodesById[id];
    const isCenter = id === center;
    return {
      id: id,
      label: shortLabel(n),
      title: esc(displayName(n)) + ' — ' + esc(humanize(n.type)) +
             (n.description ? '\n' + esc(n.description.slice(0, 140)) : ''),
      shape: 'dot',
      size: isCenter ? 22 : 12,
      color: {
        background: TYPE_COLORS[n.type] || '#888',
        border: isCenter ? ACCENT : '#ffffff',
        highlight: { background: TYPE_COLORS[n.type] || '#888', border: ACCENT }
      },
      borderWidth: isCenter ? 4 : 2,
      font: { size: 12, color: '#333' }
    };
  }));

  const visEdges = new vis.DataSet(edgeList.map(function (e, i) {
    return {
      id: 'e' + i,
      from: e.source,
      to: e.target,
      width: CONF_WIDTH[e.confidence] || 1,
      color: { color: e.contradicts ? CONTRADICT_COLOR : EDGE_COLOR, highlight: ACCENT },
      dashes: e.contradicts ? [5, 5] : false,
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      _edge: e
    };
  }));

  if (!net) {
    net = new vis.Network(el('network'), { nodes: visNodes, edges: visEdges }, exploreOptions());
    net.on('click', onCanvasClick);
    net.on('doubleClick', function (params) {
      if (params.nodes.length) {
        state.center = params.nodes[0];
        state.hops = 1; setHopsButtonsOnly(1);
        renderExplore();
      }
    });
  } else {
    net.setData({ nodes: visNodes, edges: visEdges });
  }

  const stats = ids.size + ' nodes · ' + edgeList.length + ' edges' +
    (truncated ? ' · capped at 150 (showing highest-degree nodes)' : '') +
    (note ? ' · ' + note : '');
  el('viewStats').textContent = stats;

  if (center && ids.has(center)) {
    net.once('stabilized', function () { /* keep current view stable */ });
    net.focus(center, { scale: 1, animation: false });
  } else {
    net.fit({ animation: false });
  }

  if (center && nodesById[center]) showNode(center);
}

function setHopsButtonsOnly(h) {
  state.hops = h;
  el('hops1').classList.toggle('active', h === 1);
  el('hops2').classList.toggle('active', h === 2);
}

function exploreOptions() {
  return {
    physics: { barnesHut: { gravitationalConstant: -8000, springLength: 120 }, stabilization: { iterations: 150 } },
    interaction: { hover: true, tooltipDelay: 120 },
    nodes: { font: { face: 'system-ui' } }
  };
}

function onCanvasClick(params) {
  if (params.edges.length) {
    const e = net.body.data.edges.get(params.edges[0])._edge;
    showEdge(e);
  } else if (params.nodes.length) {
    showNode(params.nodes[0]);
  }
}

/* ---------------- side panel ---------------- */

function showNode(id) {
  const n = nodesById[id];
  if (!n) return;
  const panel = el('panel');
  const edges = incidentEdges(id);

  const byRel = {};
  edges.forEach(function (e) {
    (byRel[e.relation] = byRel[e.relation] || []).push(e);
  });

  let html = '<span class="badge">' + esc(humanize(n.type)) + '</span>';
  html += '<h2>' + esc(displayName(n)) + '</h2>';
  if (n.description) html += '<p class="desc">' + esc(n.description) + '</p>';
  if (n.synonyms && n.synonyms.length) {
    html += '<h3>Synonyms</h3><ul class="syn-list">' +
      n.synonyms.slice(0, 12).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ul>';
  }
  const extra = n.extra || {};
  if (extra.url || extra.nct) {
    const link = linkifyRef(extra.url || extra.nct);
    if (link) html += '<p><a href="' + esc(link.url) + '" target="_blank" rel="noopener">Open record &rarr;</a></p>';
  }
  if (extra.therapy_status && extra.therapy_status.note) {
    html += '<h3>Therapy status</h3><p class="desc">' + esc(extra.therapy_status.note) + '</p>';
  }

  html += '<h3>Connections (' + edges.length + ')</h3>';
  Object.keys(byRel).sort().forEach(function (rel) {
    html += '<div class="rel-group"><div class="rel-head">' + esc(humanize(rel)) + ' (' + byRel[rel].length + ')</div>';
    byRel[rel].slice(0, 10).forEach(function (e, i) {
      const other = e.source === id ? e.target : e.source;
      const dir = e.source === id ? '&rarr;' : '&larr;';
      html += '<button class="edge-row" data-rel="' + esc(rel) + '" data-k="' + i + '">' +
        '<span class="rel">' + esc(shortLabel(nodesById[other])) + '</span> ' +
        '<span class="via">' + dir + ' ' + esc((e.note || '').slice(0, 90)) + '</span></button>';
    });
    if (byRel[rel].length > 10) html += '<p class="via">+' + (byRel[rel].length - 10) + ' more</p>';
    html += '</div>';
  });
  panel.innerHTML = html;

  panel.querySelectorAll('.edge-row').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const rel = btn.dataset.rel;
      showEdge(byRel[rel][Number(btn.dataset.k)]);
    });
  });
}

function showEdge(e) {
  const panel = el('panel');
  const ref = linkifyRef(e.source_ref);
  let html = '<span class="badge">' + esc(humanize(e.relation)) + '</span>';
  html += '<h2>Edge evidence</h2>';
  if (e.contradicts) {
    html += '<p><span class="badge warn">Contradictory evidence</span></p>' +
      '<p class="desc">Sources disagree on this link — treat it as contested, not settled.</p>';
  }
  html += '<dl class="kv">';
  html += '<dt>Link</dt><dd>' + esc(displayName(nodesById[e.source])) +
    ' &rarr; ' + esc(displayName(nodesById[e.target])) + '</dd>';
  if (e.note) html += '<dt>Note</dt><dd>' + esc(e.note) + '</dd>';
  if (e.source_quote) html += '<dt>Verbatim source quote</dt><dd class="quote">&ldquo;' + esc(e.source_quote) + '&rdquo;</dd>';
  html += '<dt>Source</dt><dd>' + esc(e.source_db || 'unknown') + '</dd>';
  if (e.source_ref) {
    html += '<dt>Reference</dt><dd>' +
      (ref ? '<a href="' + esc(ref.url) + '" target="_blank" rel="noopener">' + esc(ref.label) + '</a>'
           : esc(e.source_ref)) + '</dd>';
  }
  html += '<dt>Confidence</dt><dd><span class="badge conf-' + esc(e.confidence) + '">' +
    esc(e.confidence) + '</span> <span class="conf-plain">' + esc(plainConfidence(e)) + '</span></dd>';
  if (e.evidence) html += '<dt>Evidence</dt><dd>' + esc(e.evidence) + '</dd>';
  if (e.evidence_type) html += '<dt>Study type</dt><dd>' + esc(evidenceLabel(e.evidence_type)) + '</dd>';
  if (e.publication_year) html += '<dt>Published</dt><dd>' + esc(e.publication_year) + '</dd>';
  if (e.date) html += '<dt>Date</dt><dd>' + esc(e.date) + '</dd>';
  html += '</dl>';
  html += '<p><button class="btn" id="backToNode">&larr; Back to node</button></p>';
  panel.innerHTML = html;
  el('backToNode').addEventListener('click', function () { showNode(e.source); });
}

/* ---------------- clusters ---------------- */

function initClusters() {
  const wrap = el('clusterCards');
  wrap.innerHTML = GRAPH.clusters.map(function (c) {
    const assets = (c.reusable_assets || []).join('; ');
    const gaps = (c.gaps || []).join(' ');
    return '<article class="card">' +
      '<h2>' + esc(c.label) + '</h2>' +
      '<div class="count">' + c.members.length + ' members</div>' +
      '<p>' + esc(c.summary || '') + '</p>' +
      (c.shared_mechanism ? '<div class="kv-line"><strong>Shared mechanism:</strong> ' + esc(c.shared_mechanism) + '</div>' : '') +
      (assets ? '<div class="kv-line"><strong>Reusable assets:</strong> ' + esc(assets) + '</div>' : '') +
      (gaps ? '<div class="kv-line"><strong>Gaps:</strong> ' + esc(gaps) + '</div>' : '') +
      (c.next_experiment ? '<div class="kv-line"><strong>Next experiment:</strong> ' + esc(c.next_experiment) + '</div>' : '') +
      '<div class="limit-callout"><strong>Limitation:</strong> these diseases share biological ' +
      'mechanisms. That does <em>not</em> mean treatments transfer between them — therapeutic ' +
      'applicability needs separate validation. Example: MPS II&rsquo;s Elaprase does not cross the ' +
      'blood&ndash;brain barrier, so it cannot treat Sanfilippo&rsquo;s brain disease despite their ' +
      'shared heparan-sulfate buildup.</div>' +
      '<button class="btn" data-cluster="' + c.id + '">Load members in Explore</button>' +
      '</article>';
  }).join('');

  wrap.querySelectorAll('button[data-cluster]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const c = GRAPH.clusters.find(function (cl) { return String(cl.id) === btn.dataset.cluster; });
      if (!c) return;
      state.center = c.members[0] || null;
      switchTab('explore');
      renderExplore(c.members.slice(), 'cluster: ' + c.label);
    });
  });
}

/* ---------------- patient action ---------------- */

function initPatientAction() {
  const sel = el('diseaseSelect');
  const diseases = GRAPH.nodes
    .filter(function (n) { return n.type === 'disease'; })
    .sort(function (a, b) { return displayName(a).localeCompare(displayName(b)); });
  sel.innerHTML = diseases.map(function (d) {
    return '<option value="' + esc(d.id) + '">' + esc(displayName(d)) + '</option>';
  }).join('');
  const start = (GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.start) || null;
  if (start && nodesById[start]) sel.value = start;
  sel.addEventListener('change', function () { renderPatientAction(sel.value); });
  renderPatientAction(sel.value);
}

function actionNeighbors(diseaseId, type) {
  const out = [];
  incidentEdges(diseaseId).forEach(function (e) {
    const other = e.source === diseaseId ? e.target : e.source;
    const n = nodesById[other];
    if (n && n.type === type) out.push({ node: n, edge: e });
  });
  return out;
}

function renderPatientAction(diseaseId) {
  const d = nodesById[diseaseId];
  const body = el('actionBody');
  if (!d) { body.innerHTML = '<p>Select a disease.</p>'; return; }

  const trials = actionNeighbors(diseaseId, 'trial');
  const recruiting = trials.filter(function (t) {
    return (t.node.extra && t.node.extra.status) === 'RECRUITING';
  });
  const others = trials.filter(function (t) {
    return !((t.node.extra && t.node.extra.status) === 'RECRUITING');
  });
  const orgs = actionNeighbors(diseaseId, 'patient_org');
  const assets = actionNeighbors(diseaseId, 'asset');
  const cluster = GRAPH.clusters.find(function (c) { return c.id === d.cluster_id; });

  let html = '';

  // Therapy status banner (e.g. the Fayuvi pivot).
  const ts = d.extra && d.extra.therapy_status;
  if (ts && ts.note) {
    const link = linkifyRef(ts.source_ref);
    html += '<div class="therapy-banner"><strong>Latest therapy development</strong>' +
      esc(ts.note) +
      (link ? ' <a href="' + esc(link.url) + '" target="_blank" rel="noopener">Source &rarr;</a>' : '') +
      '</div>';
  }

  // Fayuvi eligibility: who is outside the label, and their path.
  if (ts && ts.fayuvi) {
    html += '<div class="fayuvi-alert"><strong>Who can&rsquo;t access Fayuvi — and their path</strong>' +
      '<ul class="excluded-list">' +
      '<li><strong>Who qualifies:</strong> ' + esc(ts.who_qualifies || '') + '</li>' +
      '<li><strong>Who may fall outside the label:</strong> ' + esc(ts.who_may_not || '') + '</li>' +
      '<li><strong>Their path:</strong> ' + esc(ts.their_path || '') + '</li>' +
      '</ul></div>';
  }

  html += '<p class="section-lede">For <strong>' + esc(displayName(d)) + '</strong> — what a family can do this week.</p>';
  html += '<div class="action-grid">';

  // Trials
  html += '<div class="action-card"><h2>Clinical trials (' + trials.length + ')</h2>';
  if (!trials.length) html += '<p class="item-sub">No trials linked in the graph yet.</p>';
  recruiting.concat(others).forEach(function (t) {
    const ex = t.node.extra || {};
    const status = ex.status || 'UNKNOWN';
    const cls = status === 'RECRUITING' ? 'recruiting' : 'notrecruiting';
    const phases = (ex.phase || []).map(humanize).join(', ');
    html += '<div class="action-item"><div class="item-title">' + esc(t.node.label) +
      '<span class="status ' + cls + '">' + esc(humanize(status).toLowerCase()) + '</span></div>' +
      '<div class="item-sub">' +
      (ex.nct ? '<a href="https://clinicaltrials.gov/study/' + esc(ex.nct) + '" target="_blank" rel="noopener">' + esc(ex.nct) + '</a> · ' : '') +
      (phases ? esc(phases) + ' · ' : '') + (ex.sponsor ? esc(ex.sponsor) : '') +
      '</div></div>';
  });
  html += '</div>';

  // Patient orgs
  html += '<div class="action-card"><h2>Patient organizations (' + orgs.length + ')</h2>';
  if (!orgs.length) html += '<p class="item-sub">No organizations linked in the graph yet.</p>';
  orgs.forEach(function (o) {
    const url = (o.node.extra && o.node.extra.url) || null;
    const assetsOffered = (o.node.extra && o.node.extra.assets) || [];
    html += '<div class="action-item"><div class="item-title">' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(displayName(o.node)) + '</a>'
           : esc(displayName(o.node))) + '</div>' +
      (assetsOffered.length ? '<div class="item-sub">' + esc(assetsOffered.join('; ')) + '</div>' : '') +
      '</div>';
  });
  html += '</div>';

  // Reusable assets
  html += '<div class="action-card"><h2>Reusable assets (' + assets.length + ')</h2>';
  if (!assets.length) html += '<p class="item-sub">No reusable assets linked in the graph yet.</p>';
  assets.forEach(function (a) {
    const stage = (a.node.extra && a.node.extra.stage) || '';
    html += '<div class="action-item"><div class="item-title">' + esc(displayName(a.node)) + '</div>' +
      '<div class="item-sub">' + esc((a.node.description || '').slice(0, 200)) +
      (stage ? ' · Stage: ' + esc(humanize(stage)) : '') + '</div></div>';
  });
  html += '</div>';

  // Research gaps
  html += '<div class="action-card"><h2>Open research gaps</h2>';
  const gaps = cluster && cluster.gaps ? cluster.gaps : [];
  if (gaps.length) {
    html += '<ul class="gap-list">' + gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>';
  } else {
    html += '<p class="item-sub">No gaps recorded for this disease&rsquo;s cluster.</p>';
  }
  if (cluster && cluster.next_experiment) {
    html += '<div class="kv-line"><strong>Proposed next step:</strong> ' + esc(cluster.next_experiment) + '</div>';
  }
  html += '</div>';

  html += '</div>';
  body.innerHTML = html;
}

/* ---------------- 10x impact ---------------- */

function initImpact() {
  const body = el('impactBody');
  const tx = GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.ten_x;
  if (!tx) {
    body.innerHTML = '<p class="section-lede">The 10&times; case is being computed.</p>';
    return;
  }
  const maxY = Math.max(tx.baseline_years, tx.proposed_years, 0.1);
  function bar(years, cls) {
    return '<div class="gantt-track"><div class="gantt-bar ' + cls + '" style="width:' +
      Math.round(100 * years / maxY) + '%"></div></div>';
  }
  let html = '<p class="section-lede">' + esc(tx.title || 'The 10x case') + '</p>';
  html += '<div class="gantt">';
  html += '<div class="gantt-row"><div class="gantt-label">Baseline: ' + esc(tx.baseline_label || 'siloed study') + '</div>' +
    bar(tx.baseline_years, 'baseline') + '<div class="gantt-years">' + tx.baseline_years + ' yrs</div></div>';
  html += '<div class="gantt-row"><div class="gantt-label">Proposed: ' + esc(tx.proposed_label || 'shared study') + '</div>' +
    bar(tx.proposed_years, 'proposed') + '<div class="gantt-years">' + tx.proposed_years + ' yrs</div></div>';
  html += '</div>';
  const saved = (tx.baseline_years - tx.proposed_years).toFixed(1);
  html += '<p><strong>Time saved: ~' + saved + ' years</strong> (' +
    Math.round(100 * (tx.baseline_years - tx.proposed_years) / tx.baseline_years) +
    '% of the baseline timeline).</p>';

  if (tx.phases && tx.phases.length) {
    html += '<h3>Where the time goes</h3><ul class="assume-list">';
    tx.phases.forEach(function (p) {
      html += '<li><strong>' + esc(p.name) + ':</strong> baseline ' + p.baseline +
        ' yrs &rarr; proposed ' + p.proposed + ' yrs — ' + esc(p.why) + '</li>';
    });
    html += '</ul>';
  }
  if (tx.assumptions && tx.assumptions.length) {
    html += '<h3>Assumptions (stated, not hidden)</h3><ol class="assume-list">';
    tx.assumptions.forEach(function (a) { html += '<li>' + esc(a) + '</li>'; });
    html += '</ol>';
  }
  if (tx.sources && tx.sources.length) {
    html += '<h3>Sources</h3><ul class="assume-list">';
    tx.sources.forEach(function (s) {
      const link = linkifyRef(s.url || '');
      html += '<li>' + esc(s.label || s.url || '') +
        (link ? ' <a href="' + esc(link.url) + '" target="_blank" rel="noopener">link &rarr;</a>' : '') + '</li>';
    });
    html += '</ul>';
  }
  body.innerHTML = html;
}

function journeySteps() {
  return (GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.steps) || [];
}

function initJourney() {
  const steps = journeySteps();
  el('prevStep').addEventListener('click', function () { stepTo(state.journeyStep - 1); });
  el('nextStep').addEventListener('click', function () { stepTo(state.journeyStep + 1); });
  const dots = el('stepDots');
  dots.innerHTML = steps.map(function (s, i) {
    const n = nodesById[s.node];
    return '<button class="dot" data-i="' + i + '" role="tab" aria-label="Step ' + (i + 1) + ': ' +
      esc(shortLabel(n, 24)) + '">' + (i + 1) + '</button>';
  }).join('');
  dots.querySelectorAll('.dot').forEach(function (d) {
    d.addEventListener('click', function () { stepTo(Number(d.dataset.i)); });
  });
  document.addEventListener('keydown', function (ev) {
    if (state.tab !== 'journey') return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (ev.key === 'ArrowRight') stepTo(state.journeyStep + 1);
    if (ev.key === 'ArrowLeft') stepTo(state.journeyStep - 1);
  });
  stepTo(0, true);
}

function stepTo(i, silent) {
  const steps = journeySteps();
  if (i < 0 || i >= steps.length) return;
  state.journeyStep = i;
  if (state.tab === 'journey' || silent) renderJourneyStep(i);
  updateJourneyChrome();
}

function updateJourneyChrome() {
  const steps = journeySteps();
  el('stepCount').textContent = 'Step ' + (state.journeyStep + 1) + ' of ' + steps.length;
  el('prevStep').disabled = state.journeyStep === 0;
  el('nextStep').disabled = state.journeyStep === steps.length - 1;
  el('stepDots').querySelectorAll('.dot').forEach(function (d, i) {
    d.classList.toggle('current', i === state.journeyStep);
    d.classList.toggle('done', i < state.journeyStep);
  });
}

/* Find a real graph edge between two journey steps (either direction), for the panel. */
function edgeBetween(a, b) {
  const out = (edgesOut[a] || []).map(function (i) { return GRAPH.edges[i]; })
    .filter(function (e) { return e.target === b; });
  if (out.length) return out[0];
  const inn = (edgesIn[a] || []).map(function (i) { return GRAPH.edges[i]; })
    .filter(function (e) { return e.source === b; });
  return inn.length ? inn[0] : null;
}

function renderJourneyStep(i) {
  const steps = journeySteps();
  const step = steps[i];
  const node = nodesById[step.node];

  // Mini-canvas: the journey path as a deterministic left-to-right chain.
  const visNodes = new vis.DataSet(steps.map(function (s, k) {
    const n = nodesById[s.node];
    const isCur = k === i;
    return {
      id: 'j' + k,
      label: shortLabel(n, 24),
      title: esc(displayName(n)) + ' — ' + esc(humanize(n.type)),
      shape: 'dot',
      size: isCur ? 20 : 12,
      color: {
        background: isCur ? ACCENT : (k < i ? '#9db4e8' : '#d7dce2'),
        border: '#ffffff',
        highlight: { background: ACCENT, border: ACCENT }
      },
      borderWidth: isCur ? 4 : 2,
      font: { size: 11, color: '#333' }
    };
  }));
  const visEdges = new vis.DataSet(steps.slice(0, -1).map(function (s, k) {
    const e = edgeBetween(s.node, steps[k + 1].node);
    return {
      id: 'je' + k,
      from: 'j' + k,
      to: 'j' + (k + 1),
      width: k < i ? 2 : 1,
      color: { color: k < i ? '#9db4e8' : EDGE_COLOR, highlight: ACCENT },
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      title: e && e.note ? esc(e.note.slice(0, 120)) : ''
    };
  }));

  const options = {
    layout: { hierarchical: { direction: 'LR', sortMethod: 'directed', nodeSpacing: 110, levelSeparation: 130 } },
    physics: false,
    interaction: { hover: true, dragNodes: false, zoomView: false, dragView: true }
  };
  if (!journeyNet) {
    journeyNet = new vis.Network(el('journeyNetwork'), { nodes: visNodes, edges: visEdges }, options);
    journeyNet.on('click', function (params) {
      if (params.nodes.length) stepTo(Number(params.nodes[0].slice(1)));
    });
  } else {
    journeyNet.setData({ nodes: visNodes, edges: visEdges });
    journeyNet.setOptions(options);
  }
  journeyNet.fit({ animation: false });

  // Panel: why + supporting edge note.
  const panel = el('stepPanel');
  const why = step.why || '';
  const edgeNote = step.edge_note || '';
  let html = '<span class="badge">' + esc(humanize(node.type)) + '</span>';
  html += '<h2>' + esc(displayName(node)) + '</h2>';
  if (node.description) html += '<p class="desc">' + esc(node.description) + '</p>';
  html += '<h3>Why this step matters</h3><p class="why">' + esc(why) + '</p>';
  if (edgeNote) {
    html += '<h3>Supporting evidence</h3><div class="edge-note-box">' + esc(edgeNote) + '</div>';
  }
  const e = i > 0 ? edgeBetween(steps[i - 1].node, step.node) : null;
  if (e) {
    const ref = linkifyRef(e.source_ref);
    html += '<h3>Graph edge</h3><p class="desc">' + esc(humanize(e.relation)) +
      ' · <span class="badge conf-' + esc(e.confidence) + '">' + esc(e.confidence) + '</span> ' +
      '<span class="conf-plain">' + esc(plainConfidence(e)) + '</span></p>' +
      '<p class="desc">' + esc(e.note || '') + '</p>' +
      (ref ? '<p><a href="' + esc(ref.url) + '" target="_blank" rel="noopener">' + esc(ref.label) + ' &rarr;</a></p>' : '');
  }
  panel.innerHTML = html;
  updateJourneyChrome();
}
