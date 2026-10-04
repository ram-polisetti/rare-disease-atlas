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
  disease:     '#7c3aed',
  gene:        '#db2777',
  variant:     '#a8a29e',
  phenotype:   '#d6d3d1',
  trial:       '#c2410c',
  patient_org: '#6d5fc0',
  researcher:  '#a16207',
  mechanism:   '#44403c',
  asset:       '#78716c',
  funding:     '#b45309',
  paper:       '#525252'
};
const ACCENT = '#3f3f46';
const EDGE_COLOR = '#c4c9d1';
const CONTRADICT_COLOR = '#d97777';

/* One plain-language line per tab, shown under the tab bar so nobody has to
 * guess what a tab means. */
const TAB_DESCS = {
  guide: 'Answer one question at a time \u2014 describe symptoms or a diagnosis and we\u2019ll narrow it down together.',
  action: 'Everything the atlas records about one condition: genes, symptoms, trials, and patient groups.',
  journey: 'The path families usually walk, plotted from this disease\u2019s actual data \u2014 trials, organizations, and research.',
  recent: 'The newest research and trials added to the atlas.',
  gaps: 'Where the atlas is weak, thin, or silent \u2014 with the exact references, so you can see what\u2019s missing.',
  contradictions: 'Places where the evidence disagrees with itself.',
  explore: 'Search the full knowledge graph: every entry, every connection, and the evidence behind each link.',
  clusters: 'Diseases that break the same machinery in the body \u2014 so progress on one can help the others.',
  endpoints: 'What clinical trials measure \u2014 and which diseases measure the same things.',
  whatif: 'Ask \u201cwhat would change if\u2026\u201d and see what the data supports.',
  impact: 'One worked example: how sharing could cut a study from 5.5 years to 2.2.',
};
function renderTabDesc() {
  const d = el('tabDesc');
  if (d) d.textContent = TAB_DESCS[state.tab] || '';
}

const state = {
  tab: 'guide',
  center: null,
  hops: 1,
  clusterOnly: false,
  recentOnly: false,
  strongOnly: false,
  journeyStep: 0,
  selectedDisease: null,
  lastNode: null,
  hiddenTypes: {}
};

let net = null;        // explore vis-network

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
  // Prefer synonyms that read like disease names; never surface drug names
  // (e.g. MONDO lists "Aglucosidase alfa" as a synonym of Pompe disease).
  const drugPat = /(alfa|beta|gamma|mab|nib|tinib|pase|zyme|plasm)\b/i;
  const diseasePat = /(disease|deficiency|syndrome|disorder|dystrophy|lipidosis|mucopolysaccharidosis|gangliosidosis)/i;
  const named = cands.filter(function (s) { return diseasePat.test(s) && !drugPat.test(s); });
  const pool = named.length ? named : cands.filter(function (s) { return !drugPat.test(s); });
  const words = pool.filter(function (s) { return /[a-z]/.test(s) && /\s/.test(s); });
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
  if (d.length <= max) return d;
  const cut = d.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut) + '\u2026';
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
  var loadingEl = el('loading');
  if (loadingEl) loadingEl.style.display = 'none';
  var metaEl = el('graphMeta');
  if (metaEl) {
    /* Plain-language subtitle: name what the entries are, and hush the
     * cluster count — parents care about coverage, not our taxonomy. */
    var byType = {};
    (GRAPH.nodes || []).forEach(function (n) { var t = n.type || '?'; byType[t] = (byType[t] || 0) + 1; });
    var ct = function (t) { return (byType[t] || 0).toLocaleString(); };
    metaEl.innerHTML =
      ct('disease') + ' diseases &middot; ' + ct('phenotype') + ' symptoms &middot; ' + ct('trial') + ' trials &middot; ' +
      ct('gene') + ' genes &middot; ' + ct('patient_org') + ' patient groups' +
      ' <span class="meta-sub">&mdash; ' + GRAPH.edges.length.toLocaleString() +
      ' connections across ' + (GRAPH.clusters || []).length + ' related groups</span>';
  }
  var footEl = el('footerStats');
  if (footEl) footEl.textContent =
    'Slice: ' + (GRAPH.meta && GRAPH.meta.slice ? GRAPH.meta.slice : 'rare diseases') + '.';

  buildTypeLegend();
  renderTabDesc();
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
    selectJourneyState: selectJourneyState, renderExplore: renderExplore, switchTab: switchTab,
    getDisease: getDisease, setDisease: setDisease
  };
  window.__atlasReady = true;
}

/* ---------------- tabs ---------------- */

/* Parent / researcher mode. Persisted in localStorage under key rda_mode.
 * Parent mode (default) shows the calm parent-facing views; researcher mode
 * additionally reveals the research tools. */
/* Disease follows the visitor: one shared selection across every tab,
 * persisted so it survives reloads. */
const DISEASE_KEY = 'rda_disease';

function getDisease() {
  if (state.selectedDisease && nodesById[state.selectedDisease]) return state.selectedDisease;
  try {
    const saved = localStorage.getItem(DISEASE_KEY);
    if (saved && nodesById[saved]) { state.selectedDisease = saved; return saved; }
  } catch (err) {}
  return null;
}

function setDisease(id) {
  if (!id || !nodesById[id]) return;
  state.selectedDisease = id;
  try { localStorage.setItem(DISEASE_KEY, id); } catch (err) {}
}

/* All eleven tabs are visible to everyone — no mode gate. */
function initTabs() {
  document.querySelectorAll('.tabs button').forEach(function (btn) {
    btn.removeAttribute('hidden');
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });
}

function switchTab(name) {
  // Structural redirects (Start merged into Guide; Subway lives inside Clusters).
  if (name === 'start') name = 'guide';
  if (name === 'subway') {
    name = 'clusters';
    var st = el('subwayToggle');
    if (st && !st.checked) { st.checked = true; st.dispatchEvent(new Event('change')); }
    var wrap = el('subwayInClusters');
    if (wrap) wrap.hidden = false;
  }
  // No mode gate: every tab is reachable by everyone.
  var view = el('view-' + name);
  if (!view) name = 'guide'; // unknown tab ids fall back to the front door
  state.tab = name;
  document.querySelectorAll('.tabs button').forEach(function (btn) {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.view').forEach(function (v) { v.hidden = true; });
  el('view-' + name).hidden = false;
  renderTabDesc();
  /* The graph needs the whole screen when the data gets big. */
  document.body.classList.toggle('wide-explore', name === 'explore');
  if (name === 'explore' && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
  }
  if (name === 'action') {
    const dsel = el('diseaseSelect');
    const cur = getDisease();
    if (dsel && cur) dsel.value = cur;
  }
  if (name === 'journey') {
    // Keep the navigator's disease select in sync with the shared selection
    // (e.g. set on the Your Disease page); re-render steps if a state is picked.
    const jsel = el('journeyDisease');
    const cur = getDisease();
    if (jsel && cur) jsel.value = cur;
    renderJourneySteps();
  }
  if (name === 'explore') {
    // The graph follows the disease the visitor is already looking at.
    const cur = getDisease();
    if (cur && state.center !== cur) {
      state.center = cur; state.hops = 1; state.clusterOnly = false;
      setHopsButtonsOnly(1);
      const co = el('clusterOnly'); if (co) co.checked = false;
      renderExplore();
    }
  }
  if (name === 'endpoints') {
    // Preselect the disease group matching the shared disease.
    const cur = getDisease();
    const pk = el('epPick');
    if (pk && cur && typeof epFamilyOf === 'function') {
      const fid = epFamilyOf(cur);
      if (fid && pk.value !== fid) {
        pk.value = fid;
        pk.dispatchEvent(new Event('change'));
      }
    }
  }
}

/* ---------------- search ---------------- */

function initSearch() {
  const input = el('search');
  const box = el('suggestions');
  if (input) { input.setAttribute('aria-controls', 'suggestions'); input.setAttribute('aria-autocomplete', 'list'); }
  if (box) { box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', 'Search suggestions'); }
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
    if (input) input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    if (!items.length) {
      box.innerHTML = '<div class="sug no-results" role="option" aria-selected="false">No matches found — try a different spelling</div>';
      box.hidden = false;
      return;
    }
    box.innerHTML = items.map(function (it, i) {
      const n = nodesById[it[2]];
      return '<button class="sug' + (i === 0 ? ' highlight' : '') + '" data-i="' + i + '" role="option" aria-selected="' + (i === 0 ? 'true' : 'false') + '">' +
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
    setDisease(id);
    state.hops = 1; state.clusterOnly = false;
    setHopsButtonsOnly(1);
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
  /* Entry-type toggles: let the visitor show or hide whole kinds of nodes. */
  const tt = el('typeToggles');
  if (tt) {
    const types = Object.keys(TYPE_COLORS).filter(function (t) {
      return GRAPH.nodes.some(function (n) { return n.type === t; });
    });
    tt.innerHTML = types.map(function (t) {
      return '<label class="check"><input type="checkbox" data-ntype="' + esc(t) + '" checked>' +
        '<span class="tdot" style="background:' + TYPE_COLORS[t] + '"></span>' + esc(humanize(t)) + '</label>';
    }).join('');
    tt.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        if (this.checked) delete state.hiddenTypes[this.dataset.ntype];
        else state.hiddenTypes[this.dataset.ntype] = true;
        renderExplore();
      });
    });
  }
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
  el('hops1').setAttribute('aria-pressed', h === 1 ? 'true' : 'false');
  el('hops2').setAttribute('aria-pressed', h === 2 ? 'true' : 'false');
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

  /* Entry-type toggles: hide whole kinds of nodes. The starting point stays. */
  const hidden = state.hiddenTypes || {};
  const hiddenList = Object.keys(hidden).filter(function (t) { return hidden[t]; });
  if (hiddenList.length) {
    ids = new Set(Array.from(ids).filter(function (id) {
      return id === center || !hidden[nodesById[id].type];
    }));
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
      label: (function () {
        if (id !== center) return shortLabel(n);
        var full = displayName(n);
        return full.length > 42 ? full.slice(0, 42) + '\u2026' : full;
      })(),
      title: esc(displayName(n)) + ' — ' + esc(humanize(n.type)) +
             (n.description ? '\n' + esc(n.description.slice(0, 140)) : ''),
      shape: 'dot',
      size: isCenter ? 30 : 12,
      color: {
        background: TYPE_COLORS[n.type] || '#888',
        border: isCenter ? ACCENT : '#ffffff',
        highlight: { background: TYPE_COLORS[n.type] || '#888', border: ACCENT }
      },
      borderWidth: isCenter ? 5 : 2,
      font: { size: isCenter ? 15 : 12, color: '#333', bold: isCenter }
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

  if (ids.size === 0) {
    el('viewStats').textContent = 'No nodes to display.';
    if (net) net.setData({ nodes: new vis.DataSet([]), edges: new vis.DataSet([]) });
    el('panel').innerHTML = '<p>Search for a disease, gene, or trial to begin exploring.</p>';
    return;
  }
  var sumEl = document.getElementById('networkSummary');
  if (!sumEl) {
    sumEl = document.createElement('div');
    sumEl.id = 'networkSummary';
    sumEl.className = 'sr-only';
    sumEl.setAttribute('aria-live', 'polite');
    el('network').parentNode.insertBefore(sumEl, el('network'));
  }
  sumEl.textContent = 'Network graph showing ' + ids.size + ' entries and ' + edgeList.length +
    ' connections' + (center && nodesById[center] ? ' centered on ' + displayName(nodesById[center]) : '') + '.';
  const stats = ids.size + ' entries · ' + edgeList.length + ' connections' +
    (truncated ? ' · capped at 150 (showing the most connected entries)' : '') +
    (hiddenList.length ? ' · hiding: ' + hiddenList.map(function (t) { return humanize(t); }).join(', ') : '') +
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
  el('hops1').setAttribute('aria-pressed', h === 1 ? 'true' : 'false');
  el('hops2').setAttribute('aria-pressed', h === 2 ? 'true' : 'false');
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
  state.lastNode = id;
  const panel = el('panel');
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Details panel');
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
  var confIcon = e.confidence === 'low' ? '\u25CB ' : e.confidence === 'medium' ? '\u25D0 ' : '\u25CF ';
  html += '<dt>Confidence</dt><dd><span class="badge conf-badge conf-' + esc(e.confidence) + '" aria-label="Confidence: ' + esc(e.confidence) + '">' +
    confIcon + esc(e.confidence) + '</span> <span class="conf-plain">' + esc(plainConfidence(e)) + '</span></dd>';
  if (e.evidence) html += '<dt>Evidence</dt><dd>' + esc(e.evidence) + '</dd>';
  if (e.evidence_type) html += '<dt class="tech-detail">Study type</dt><dd class="tech-detail">' + esc(evidenceLabel(e.evidence_type)) + '</dd>';
  if (e.publication_year) html += '<dt class="tech-detail">Published</dt><dd class="tech-detail">' + esc(e.publication_year) + '</dd>';
  if (e.date) html += '<dt class="tech-detail">Date</dt><dd class="tech-detail">' + esc(e.date) + '</dd>';
  html += '</dl>';
  html += '<p><button class="btn" id="backToNode">&larr; Back to node</button></p>';
  panel.innerHTML = html;
  el('backToNode').addEventListener('click', function () { showNode(state.lastNode || e.source); });
}

/* ---------------- clusters ---------------- */

function initClusters() {
  const wrap = el('clusterCards');
  wrap.innerHTML = GRAPH.clusters.map(function (c) {
    const assets = (c.reusable_assets || []).join('; ');
    const gaps = (c.gaps || []).join(' ');
    return '<article class="card">' +
      '<h2>' + esc(c.label) + '</h2>' +
      '<div class="count">' + c.members.length + ' diseases</div>' +
      '<p>' + esc(c.summary || '') + '</p>' +
      (c.shared_mechanism ? '<div class="kv-line"><strong>What they share:</strong> ' + esc(c.shared_mechanism) + '</div>' : '') +
      (assets ? '<div class="kv-line"><strong>Reusable assets:</strong> ' + esc(assets) + '</div>' : '') +
      (gaps ? '<div class="kv-line"><strong>Gaps:</strong> ' + esc(gaps) + '</div>' : '') +
      (c.next_experiment ? '<div class="kv-line"><strong>Next experiment:</strong> ' + esc(c.next_experiment) + '</div>' : '') +
      '<div class="limit-callout"><strong>Limitation:</strong> these diseases share biological ' +
      'mechanisms. That does <em>not</em> mean treatments transfer between them — therapeutic ' +
      'applicability needs separate validation. Example: MPS II&rsquo;s Elaprase does not cross the ' +
      'blood&ndash;brain barrier, so it cannot treat Sanfilippo&rsquo;s brain disease despite their ' +
      'shared heparan-sulfate buildup.</div>' +
      ((c.members && c.members.length)
        ? '<button class="btn" data-cluster="' + c.id + '">Load members in Explore</button>'
        : '<p class="item-sub">No members in this cluster.</p>') +
      '</article>';
  }).join('');

  wrap.querySelectorAll('button[data-cluster]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const c = GRAPH.clusters.find(function (cl) { return String(cl.id) === btn.dataset.cluster; });
      if (!c) return;
      const valid = (c.members || []).filter(function (id) { return nodesById[id]; });
      if (!valid.length) { alert('No valid nodes found in this cluster.'); return; }
      state.center = valid[0];
      switchTab('explore');
      renderExplore(valid.slice(), 'cluster: ' + c.label);
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
  sel.addEventListener('change', function () { setDisease(sel.value); renderPatientAction(sel.value); });
  var printBtn = el('actionPrint');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
  var initial = getDisease() || sel.value;
  sel.value = initial;
  setDisease(sel.value);
  renderPatientAction(sel.value);
}

/* ---------------- patient action ("Your Disease") ----------------
 * Build 3: page reordered by urgency for a stressed parent.
 * Order: status banner → what to do now → what changed recently →
 * treatment status → patient orgs → enrolling research → ways to
 * contribute → research assets & gaps (collapsed). Never invent data:
 * anything missing is labeled "not recorded". */

function actionNeighbors(diseaseId, type) {
  const out = [];
  incidentEdges(diseaseId).forEach(function (e) {
    const other = e.source === diseaseId ? e.target : e.source;
    const n = nodesById[other];
    if (n && n.type === type) out.push({ node: n, edge: e });
  });
  return out;
}

/* Approved therapies recorded in the graph (treats edges). */
function actionApprovedTherapies(diseaseId) {
  const out = [];
  incidentEdges(diseaseId).forEach(function (e) {
    if (e.relation !== 'treats') return;
    const other = e.source === diseaseId ? e.target : e.source;
    const n = nodesById[other];
    if (n) out.push({ node: n, edge: e });
  });
  return out;
}

/* Contribution routes: operational registries linked to the disease, plus
 * registries maintained by linked patient orgs. */
function actionRegistries(diseaseId) {
  const seen = {}, out = [];
  function add(n) { if (n && !seen[n.id]) { seen[n.id] = 1; out.push(n); } }
  actionNeighbors(diseaseId, 'asset').forEach(function (a) {
    const st = (a.node.extra && a.node.extra.stage) || '';
    if (/registry/i.test(a.node.label) && st === 'operational') add(a.node);
  });
  actionNeighbors(diseaseId, 'patient_org').forEach(function (o) {
    incidentEdges(o.node.id).forEach(function (e) {
      if (e.relation !== 'maintains_asset') return;
      const other = e.source === o.node.id ? e.target : e.source;
      const n = nodesById[other];
      if (n && n.type === 'asset') add(n);
    });
  });
  return out;
}

/* Researchers studying this disease (investigates edges) — contact via a
 * patient group or their institution, never assumed in the data. */
function actionResearchers(diseaseId) {
  return actionNeighbors(diseaseId, 'researcher').filter(function (r) {
    return r.edge.relation === 'investigates';
  });
}

/* Material updates for this disease, classified plainly. Reuses recency data
 * on nodes/edges (therapy_status as_of, recruiting trials, recent
 * publication years). Limited to a few items. */
function actionRecent(diseaseId, recruiting, ts) {
  const items = [];
  if (ts && ts.note) {
    items.push({
      kind: 'Treatment status',
      text: ts.note + (ts.as_of ? ' (recorded ' + ts.as_of + ')' : '')
    });
  }
  recruiting.forEach(function (t) {
    const ex = t.node.extra || {};
    items.push({
      kind: 'Trial recruiting',
      text: t.node.label + (ex.nct ? ' (' + ex.nct + ')' : '') + '.'
    });
  });
  incidentEdges(diseaseId).forEach(function (e) {
    const py = parseInt(e.publication_year, 10) || 0;
    if (py >= 2025) {
      const other = e.source === diseaseId ? e.target : e.source;
      const n = nodesById[other];
      if (!n) return;
      items.push({
        kind: 'Research finding',
        text: (e.note || (humanize(e.relation) + ': ' + displayName(n))) +
          ' (published ' + py + ')'
      });
    }
  });
  return items.slice(0, 4);
}

function actionPlural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

function renderPatientAction(diseaseId) {
  const d = nodesById[diseaseId];
  const body = el('actionBody');
  if (!d) { body.innerHTML = '<p>Select a disease.</p>'; return; }

  const trials = actionNeighbors(diseaseId, 'trial');
  const recruiting = trials.filter(function (t) {
    return /^RECRUIT/.test(String((t.node.extra && t.node.extra.status) || ''));
  });
  const others = trials.filter(function (t) {
    return !(/^RECRUIT/.test(String((t.node.extra && t.node.extra.status) || '')));
  });
  const orgs = actionNeighbors(diseaseId, 'patient_org');
  const assets = actionNeighbors(diseaseId, 'asset');
  const regs = actionRegistries(diseaseId);
  const researchers = actionResearchers(diseaseId);
  const ts = d.extra && d.extra.therapy_status;
  const therapies = actionApprovedTherapies(diseaseId);
  const cluster = GRAPH.clusters.find(function (c) { return c.id === d.cluster_id; });
  const recent = actionRecent(diseaseId, recruiting, ts);
  const name = displayName(d);

  // Anything actionable in the data at all?
  const actionable = recruiting.length || others.length || orgs.length ||
    regs.length || (ts && ts.note) || therapies.length;

  let html = '';

  // (a) Status banner — one honest line, computed from the graph.
  const treatLine = therapies.length
    ? 'Approved treatment: ' + therapies.map(function (t) { return displayName(t.node); }).join('; ') + '.'
    : (ts && ts.note ? ts.note : 'Our data does not record a treatment. Ask your specialist about current options.');
  html += '<div class="status-banner" role="status"><strong>' + esc(name) + '</strong>: ' +
    esc(treatLine) + ' ' +
    esc(actionPlural(recruiting.length, 'trial', 'trials')) + ' recruiting. ' +
    esc(actionPlural(orgs.length, 'patient organization', 'patient organizations')) + '.</div>';

  // (b) Current care & safety — what to do now, calm and plain.
  html += '<section class="action-sec" aria-label="What to do now"><h2>What to do now</h2>';
  if (actionable) {
    html += '<p>A clinical geneticist &mdash; or the specialist who follows this condition &mdash; is the right ' +
      'first call. They can confirm the diagnosis, explain what to watch for, and connect you to care and ' +
      'research. Everything on this page is only what our atlas actually holds; where our data is silent, ' +
      'we say so.</p>';
  } else {
    html += '<p class="permission">No trials, treatments, organizations, or registries are recorded for ' +
      esc(name) + ' in our data yet. <strong>Calling a specialist or a genetics clinic is still a real ' +
      'action &mdash; and it is the right one.</strong> Nothing here is your fault; the options simply ' +
      'are not in our data. You are doing the right thing by looking.</p>';
  }
  html += '<ul class="next-list">' +
    '<li><strong>What happens next:</strong> the clinician confirms the diagnosis and explains what to watch for.</li>' +
    '<li>Jot down the symptoms and timeline you have seen &mdash; a few lines is enough. Bring any records you already have; you do not need to gather everything first.</li>' +
    '<li>Ask: who follows this condition, and who would they trust for a second opinion?</li>' +
    '</ul></section>';

  // What changed recently (the Recent merge).
  if (recent.length) {
    html += '<section class="action-sec" aria-label="What changed recently"><h2>What changed recently</h2>' +
      '<ul class="recent-list">' + recent.map(function (i) {
        return '<li><strong>' + esc(i.kind) + ':</strong> ' + esc(i.text) + '</li>';
      }).join('') + '</ul></section>';
  }

  // (c) Treatment status.
  html += '<section class="action-sec" aria-label="Treatment status"><h2>Treatment status</h2>';
  if (therapies.length) {
    therapies.forEach(function (t) {
      html += '<div class="action-item"><div class="item-title">' + esc(displayName(t.node)) + '</div>' +
        (t.edge.note ? '<div class="item-sub">' + esc(t.edge.note.slice(0, 240)) + '</div>' : '') + '</div>';
    });
  }
  if (ts && ts.note) {
    const link = linkifyRef(ts.source_ref);
    html += '<div class="therapy-banner"><strong>Latest therapy development</strong>' +
      esc(ts.note) +
      (link ? ' <a href="' + esc(link.url) + '" target="_blank" rel="noopener">Source &rarr;</a>' : '') +
      '</div>';
  }
  if (ts && ts.fayuvi) {
    html += '<div class="fayuvi-alert"><strong>Who can&rsquo;t access Fayuvi — and their path</strong>' +
      '<ul class="excluded-list">' +
      '<li><strong>Who qualifies:</strong> ' + esc(ts.who_qualifies || '') + '</li>' +
      '<li><strong>Who may fall outside the label:</strong> ' + esc(ts.who_may_not || '') + '</li>' +
      '<li><strong>Their path:</strong> ' + esc(ts.their_path || '') + '</li>' +
      '</ul></div>';
  }
  if (!therapies.length && !(ts && ts.note)) {
    html += '<p class="item-sub">No treatment status recorded in our data.</p>';
  }
  html += '</section>';

  // (d) Patient organizations.
  html += '<section class="action-sec" aria-label="Patient organizations"><h2>Patient organizations (' + orgs.length + ')</h2>';
  if (!orgs.length) {
    html += '<p class="item-sub">No patient organizations recorded for this disease. If one exists that we ' +
      'missed, your specialist&rsquo;s office usually knows it.</p>';
  }
  orgs.forEach(function (o) {
    const url = (o.node.extra && o.node.extra.url) || null;
    const assetsOffered = (o.node.extra && o.node.extra.assets) || [];
    html += '<div class="action-item"><div class="item-title">' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(displayName(o.node)) + '</a>'
           : esc(displayName(o.node))) + '</div>' +
      (assetsOffered.length ? '<div class="item-sub">' + esc(assetsOffered.join('; ')) + '</div>' : '') +
      '</div>';
  });
  html += '</section>';

  // (e) Enrolling research — recruiting first.
  html += '<section class="action-sec" aria-label="Enrolling research"><h2>Enrolling research (' + trials.length + ')</h2>';
  html += '<p class="item-sub"><strong>These are studies, not treatments.</strong> A study listed here does not ' +
    'mean your child is eligible &mdash; ask your doctor about eligibility before contacting anyone.</p>';
  if (!trials.length) {
    html += '<p class="item-sub">No trials recorded for this disease.</p>';
  }
  recruiting.concat(others).forEach(function (t) {
    const ex = t.node.extra || {};
    const status = ex.status || 'UNKNOWN';
    const STATUS_CLASSES = { RECRUITING: 'recruiting', ACTIVE_NOT_RECRUITING: 'active', ENROLLING_BY_INVITATION: 'recruiting', COMPLETED: 'completed', TERMINATED: 'terminated', SUSPENDED: 'warning', WITHDRAWN: 'terminated', UNKNOWN: 'unknown' };
    const cls = STATUS_CLASSES[status] || 'unknown';
    const phases = (ex.phase || []).map(humanize).join(', ');
    html += '<div class="action-item"><div class="item-title">' + esc(t.node.label) +
      '<span class="status ' + cls + '">' + esc(humanize(status).toLowerCase()) + '</span></div>' +
      '<div class="item-sub">' +
      (ex.nct ? '<a href="https://clinicaltrials.gov/study/' + esc(ex.nct) + '" target="_blank" rel="noopener">' + esc(ex.nct) + '</a> · ' : '') +
      (phases ? esc(phases) + ' · ' : '') + (ex.sponsor ? esc(ex.sponsor) : '') +
      '</div></div>';
  });
  html += '</section>';

  // (f) Ways to contribute.
  html += '<section class="action-sec" aria-label="Ways to contribute"><h2>Ways to contribute</h2>';
  if (!regs.length && !researchers.length) {
    html += '<p class="item-sub">No contribution routes recorded for this disease yet. Asking your specialist ' +
      'about registries or studies is itself a contribution &mdash; families who ask make research happen.</p>';
  }
  if (regs.length) {
    html += '<p><strong>Registries</strong> &mdash; sharing data helps researchers understand the condition:</p>';
    regs.forEach(function (r) {
      html += '<div class="action-item"><div class="item-title">' + esc(displayName(r)) + '</div>' +
        '<div class="item-sub">Operational registry &mdash; ask your doctor about joining.</div></div>';
    });
  }
  if (researchers.length) {
    html += '<p><strong>Researchers studying this condition</strong> &mdash; a patient group or your doctor can ' +
      'help families reach them; we do not list contact details:</p><ul class="gap-list">' +
      researchers.map(function (r) { return '<li>' + esc(r.node.label) + '</li>'; }).join('') + '</ul>';
  }
  html += '</section>';

  // (g) Research assets & open gaps — collapsed; for leaders/researchers.
  html += '<details class="action-details"><summary>Research assets &amp; open gaps (for patient leaders and researchers)</summary>';
  if (assets.length) {
    html += '<h3 class="guide-h3">Reusable assets (' + assets.length + ')</h3>';
    assets.forEach(function (a) {
      const stage = (a.node.extra && a.node.extra.stage) || '';
      html += '<div class="action-item"><div class="item-title">' + esc(displayName(a.node)) + '</div>' +
        '<div class="item-sub">' + esc((a.node.description || '').slice(0, 200)) +
        (stage ? ' · Stage: ' + esc(humanize(stage)) : '') + '</div></div>';
    });
  } else {
    html += '<p class="item-sub">No reusable assets recorded for this disease.</p>';
  }
  const gaps = cluster && cluster.gaps ? cluster.gaps : [];
  html += '<h3 class="guide-h3">Open research gaps</h3>';
  if (gaps.length) {
    html += '<ul class="gap-list">' + gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>';
  } else {
    html += '<p class="item-sub">No gaps recorded for this disease&rsquo;s cluster.</p>';
  }
  if (cluster && cluster.next_experiment) {
    html += '<div class="kv-line"><strong>Proposed next step:</strong> ' + esc(cluster.next_experiment) + '</div>';
  }
  html += '<p><button type="button" class="btn" id="actionGapsBtn">Open Gaps &amp; Limits</button></p>';
  html += '</details>';

  body.innerHTML = html;
  const gb = el('actionGapsBtn');
  if (gb) gb.addEventListener('click', function () { switchTab('gaps'); });
  // Tier-1 tap-for-definition on the Your Disease page (additive).
  if (typeof markTerms === 'function') markTerms(body);
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
  let html = '<div class="ep-intro"><strong>What is this?</strong> One fully worked example of what ' +
    '&ldquo;sharing&rdquo; is worth, in years. A Sanfilippo A natural-history study built from scratch takes about ' +
    '5.5 years in this model; reusing the MPS I/II registry design and pooling across subtypes cuts it to about 2.2 years. ' +
    '<strong>These are modeled estimates, not measured results</strong> &mdash; every assumption is listed below. ' +
    '<strong>Why only one disease?</strong> Modeling takes careful assumptions, and Sanfilippo A is the one fully worked through so far. ' +
    'The method is the point: any disease with reusable designs and registries can run the same math.</div>';
  html += '<p class="section-lede">' + esc(tx.title || 'The 10x case') + '</p>';
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

/* ---------------- journey: state-based navigator (Build 4) ----------------
 * Replaces the linear stepper and the "build a journey" generator. The user
 * picks one of five states; each state shows only the next 2-3 relevant
 * steps, including explicit permission to pause and honest dead ends.
 * Steps link into graph data where it exists; anything missing says so.
 * Never invent data. */

const JOURNEY_STATES = [
  { id: 'uncertain', label: 'Diagnosis uncertain', sub: 'Something is wrong, but we do not have a name for it yet.' },
  { id: 'confirmed', label: 'Diagnosis confirmed', sub: 'We have a name for the disease.' },
  { id: 'care', label: 'Seeking care', sub: 'Looking for doctors, treatments, or support right now.' },
  { id: 'research', label: 'Considering research', sub: 'Wondering about trials and studies.' },
  { id: 'group', label: 'Building a patient group', sub: 'Wanting to organize families and researchers.' }
];
state.journeyState = null;

/* Disease this tab talks about: the shared selection, else Maria's default. */
function journeyDiseaseId() {
  const shared = getDisease();
  if (shared) return shared;
  const start = (GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.start) || null;
  if (start && nodesById[start]) return start;
  return null;
}

/* Cross-link from a step: optionally retarget the shared disease, then switch. */
function journeyGoto(tab, diseaseId) {
  if (tab === 'action' && diseaseId) {
    setDisease(diseaseId);
    const dsel = el('diseaseSelect');
    if (dsel && dsel.querySelector('option[value="' + diseaseId + '"]')) {
      dsel.value = diseaseId;
      dsel.dispatchEvent(new Event('change'));
    }
  }
  switchTab(tab);
}

/* Graph facts the steps can lean on, for one disease. */
function journeyProfile(id) {
  const n = nodesById[id];
  const orgs = actionNeighbors(id, 'patient_org').map(function (x) { return x.node; });
  const assets = actionNeighbors(id, 'asset').map(function (x) { return x.node; });
  const trialLinks = actionNeighbors(id, 'trial');
  const recruiting = trialLinks
    .filter(function (t) { return t.node.extra && t.node.extra.status === 'RECRUITING'; })
    .map(function (t) { return t.node; });
  const approved = actionApprovedTherapies(id).map(function (x) { return x.node; });
  return {
    node: n, name: displayName(n), orgs: orgs, assets: assets,
    recruiting: recruiting, nTrials: trialLinks.length, approved: approved
  };
}

function journeyOrgHtml(orgs, name) {
  if (!orgs.length) {
    return '<p class="item-sub">No patient organization is recorded for ' + esc(name) +
      ' in the graph. Your clinician can usually point to the right community.</p>';
  }
  let html = '<ul class="jlist">' + orgs.slice(0, 3).map(function (o) {
    const url = o.extra && o.extra.url;
    return '<li>' + esc(displayName(o)) +
      (url ? ': <a href="' + esc(url) + '" target="_blank" rel="noopener">website &rarr;</a>' : '') + '</li>';
  }).join('') + '</ul>';
  if (orgs.length > 3) html += '<p class="item-sub">Plus ' + (orgs.length - 3) + ' more recorded in the graph.</p>';
  return html;
}

function journeyTrialHtml(recruiting) {
  let html = '<ul class="jlist">' + recruiting.slice(0, 3).map(function (t) {
    const url = t.extra && t.extra.url;
    const label = displayName(t);
    const short = label.length > 90 ? label.slice(0, 90) + '\u2026' : label;
    return '<li>' + esc(short) +
      (url ? ': <a href="' + esc(url) + '" target="_blank" rel="noopener">trial listing &rarr;</a>' : '') + '</li>';
  }).join('') + '</ul>';
  if (recruiting.length > 3) html += '<p class="item-sub">Plus ' + (recruiting.length - 3) + ' more recruiting trials in the graph.</p>';
  return html;
}

function journeyAssetHtml(assets, name) {
  if (!assets.length) {
    return '<p class="item-sub">No reusable research assets are recorded for ' + esc(name) + ' in the graph.</p>';
  }
  return '<ul class="jlist">' + assets.slice(0, 3).map(function (a) {
    return '<li>' + esc(displayName(a)) + '</li>';
  }).join('') + '</ul>' +
    (assets.length > 3 ? '<p class="item-sub">Plus ' + (assets.length - 3) + ' more recorded in the graph.</p>' : '');
}

/* Step text, per state. Bodies are calm guidance; data appears only via
 * the graph-backed extra HTML. kinds: 'step' | 'pause' | 'deadend'. */
function journeyEvidenceHTML(id, types) {
  const edges = incidentEdges(id).filter(function (e) {
    const n = nodesById[e.source === id ? e.target : e.source];
    return n && (!types || types.indexOf(n.type) !== -1);
  });
  return '<details><summary>Evidence behind this step</summary>' + (edges.length ?
    '<ul class="jlist">' + edges.map(function (e) {
      const n = nodesById[e.source === id ? e.target : e.source];
      const ref = linkifyRef(e.source_ref);
      return '<li>' + esc(displayName(n)) + ': ' + esc(e.source_db || 'Source not recorded') + ' ' +
        (ref ? '<a href="' + esc(ref.url) + '" target="_blank" rel="noopener">' + esc(e.source_ref) + '</a>' : esc(e.source_ref || 'Reference not recorded')) +
        ' (' + esc(e.evidence || 'Evidence type not recorded') + ')</li>';
    }).join('') + '</ul>' : '<p>Our data does not record evidence for this step.</p>') + '</details>';
}

function journeyStateSteps(stateId, id) {
  const p = journeyProfile(id), name = p.name;
  const genes = actionNeighbors(id, 'gene').map(function (x) { return displayName(x.node); });
  const ts = p.node.extra && p.node.extra.therapy_status;
  const treatment = ts && ts.note ? ts.note : p.approved.length ?
    'Approved treatments recorded: ' + p.approved.map(function (n) { return displayName(n); }).join('; ') + '.' :
    'Our data does not record a treatment for this disease. This does not establish whether approved treatments exist. Ask your specialist about current options.';
  const cluster = GRAPH.clusters.find(function (c) { return c.id === p.node.cluster_id; });
  const gaps = cluster && cluster.gaps || [];
  const steps = {
    uncertain: [{ title: 'Confirm the diagnosis of ' + name,
      body: 'Only a clinician can diagnose. Genes linked in our data: ' + (genes.join(', ') || 'none recorded') + '. Ask a geneticist or metabolic specialist which tests are appropriate.', types: ['gene'] }],
    confirmed: [{ title: 'Read what is recorded about ' + name, body: treatment, types: ['therapy', 'drug'] },
      { title: 'Find a patient community', body: 'Patient organizations linked to ' + name + ' in our data:', extra: journeyOrgHtml(p.orgs, name), types: ['patient_org'] }],
    care: [{ title: 'Discuss treatment and care for ' + name, body: treatment, types: ['therapy', 'drug'], links: [{ tab: 'action', label: 'See the full treatment picture' }] }],
    research: [{ title: 'Research recorded for ' + name,
      body: p.nTrials + ' trials are linked in our data; ' + p.recruiting.length + ' are recorded as recruiting. Status can change. The trial team must confirm current recruitment and eligibility.',
      extra: journeyTrialHtml(p.recruiting), types: ['trial'] },
      { title: 'Evidence gaps', body: gaps.length ? 'These gaps are recorded for this disease group, rather than established for every individual disease: ' + gaps.join('; ') : 'Our data does not record specific evidence gaps for this disease. Missing records do not mean the evidence is complete.', types: null }],
    group: [{ title: 'Organizations linked to ' + name, body: 'Start by discussing existing community resources.', extra: journeyOrgHtml(p.orgs, name), types: ['patient_org'] },
      { title: 'Research assets linked to ' + name, body: 'Ask the asset owner about access, consent, and suitability before planning research.', extra: journeyAssetHtml(p.assets, name), types: ['asset'] }]
  };
  return (steps[stateId] || []).map(function (step) {
    step.kind = 'step'; step.extra = (step.extra || '') + journeyEvidenceHTML(id, step.types); return step;
  }).concat([{ kind: 'pause', title: 'You can pause here', body: 'You do not have to do everything today. Bring these questions to your care team when you are ready.' }]);
}

function journeyStepCard(s, id) {
  const badge = s.kind === 'pause' ? '<span class="badge j-badge-pause">You can pause here</span>'
    : s.kind === 'deadend' ? '<span class="badge warn">A place others stopped</span>'
    : '<span class="badge">Next step</span>';
  let html = '<article class="card jstep j-' + s.kind + '">' + badge +
    '<h2>' + esc(s.title) + '</h2><p>' + esc(s.body) + '</p>';
  if (s.extra) html += s.extra;
  if (s.links && s.links.length) {
    html += '<div class="btn-row">' + s.links.map(function (l) {
      if (l.tab === 'maria') {
        return '<button type="button" class="btn small" data-jmaria="1">' + esc(l.label) + '</button>';
      }
      return '<button type="button" class="btn small" data-jtab="' + esc(l.tab) + '">' + esc(l.label) + '</button>';
    }).join(' ') + '</div>';
  }
  return html + '</article>';
}

function renderJourneyStates() {
  const box = el('journeyStates');
  if (!box) return;
  box.innerHTML = JOURNEY_STATES.map(function (s) {
    const on = state.journeyState === s.id;
    return '<button type="button" class="jstate" role="radio" data-state="' + s.id + '" aria-checked="' + (on ? 'true' : 'false') + '">' +
      '<span class="js-label">' + esc(s.label) + '</span>' +
      '<span class="js-sub">' + esc(s.sub) + '</span></button>';
  }).join('');
  box.querySelectorAll('.jstate').forEach(function (b) {
    b.addEventListener('click', function () { selectJourneyState(b.dataset.state, true); });
  });
  box.addEventListener('keydown', function (ev) {
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].indexOf(ev.key) === -1) return;
    const btns = Array.prototype.slice.call(box.querySelectorAll('.jstate'));
    let i = btns.indexOf(document.activeElement);
    if (i === -1) i = 0;
    const dir = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : -1;
    const next = btns[(i + dir + btns.length) % btns.length];
    ev.preventDefault();
    next.focus();
    selectJourneyState(next.dataset.state, false);
  });
}

function selectJourneyState(id, focusSteps) {
  state.journeyState = id;
  const box = el('journeyStates');
  if (box) {
    box.querySelectorAll('.jstate').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.state === id ? 'true' : 'false');
    });
  }
  renderJourneySteps();
  if (focusSteps) {
    const q = el('journeyQ');
    if (q) q.focus({ preventScroll: true });
  }
}

function renderJourneySteps() {
  const box = el('journeySteps');
  if (!box) return;
  const selected = getDisease();
  const heading = el('journeySelectedDisease');
  if (heading) heading.textContent = selected ? displayName(nodesById[selected]) : 'Choose a disease';
  const example = document.querySelector('.journey-example');
  if (example) example.hidden = !selected || selected !== (GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.start);
  if (!state.journeyState) {
    box.innerHTML = '<p class="section-lede">Choose a situation above \u2014 the next steps will appear here.</p>';
    return;
  }
  const id = getDisease();
  if (!id) {
    box.innerHTML = '<p class="section-lede">Choose a disease above first (or pick one on the Your Disease page) so the steps can draw on real atlas data.</p>' +
      '<p><button type="button" class="btn" data-jtab="action">Open the Your Disease page</button></p>';
    wireJourneyLinks(box);
    return;
  }
  const steps = journeyStateSteps(state.journeyState, id);
  box.innerHTML = steps.map(function (s) { return journeyStepCard(s, id); }).join('');
  wireJourneyLinks(box);
  if (typeof markTerms === 'function') markTerms(box);
}

function wireJourneyLinks(box) {
  box.querySelectorAll('[data-jtab]').forEach(function (b) {
    b.addEventListener('click', function () { journeyGoto(b.dataset.jtab, getDisease()); });
  });
  box.querySelectorAll('[data-jmaria]').forEach(function (b) {
    b.addEventListener('click', function () {
      const det = document.querySelector('#view-journey details.journey-example');
      if (det) { det.open = true; det.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
}

/* Maria's worked example: state-by-state, faithful to her recorded path. */
function renderMariaPath() {
  const box = el('mariaPath');
  const id = GRAPH.journeys && GRAPH.journeys.maria && GRAPH.journeys.maria.start;
  if (!box || !nodesById[id]) return;
  box.innerHTML = '<p>This optional example uses the Sanfilippo A graph records. It is not a family history.</p>' +
    journeyStateSteps('confirmed', id).concat(journeyStateSteps('group', id)).map(function (step) { return journeyStepCard(step, id); }).join('');
  wireJourneyLinks(box);
}

function initJourney() {
  const sel = el('journeyDisease');
  if (sel) {
    sel.innerHTML = diseaseOptions().map(function (d) {
      return '<option value="' + esc(d.id) + '">' + esc(displayName(d)) + '</option>';
    }).join('');
    const cur = journeyDiseaseId();
    if (cur) { sel.value = cur; setDisease(cur); }
    sel.addEventListener('change', function () {
      setDisease(sel.value);
      renderJourneySteps();
    });
  }
  renderJourneyStates();
  renderMariaPath();
  renderJourneySteps();
}
