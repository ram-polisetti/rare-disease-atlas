"""AI Atlas for the World's Rare Diseases — Challenge 05, Hack-Nation 7th Global AI Hackathon.

Slice: lysosomal storage diseases.

Run from the project root:
    streamlit run app/app.py

The app reads ONLY data/graph.json (contract: docs/GRAPH_SCHEMA.md).
Real data only: with no graph file it shows a "data is being built" state
and never invents nodes, edges, or claims.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import streamlit as st
from streamlit_agraph import Node, Edge, Config, agraph

APP_DIR = Path(__file__).resolve().parent
GRAPH_PATH = APP_DIR.parent / "data" / "graph.json"

# --------------------------------------------------------------------------
# Styling: low ink, high signal. Whitespace does the design work.
# --------------------------------------------------------------------------

TYPE_COLORS = {
    "disease": "#D64545",      # red
    "gene": "#2F6FB2",        # blue
    "variant": "#D98A2B",      # amber
    "phenotype": "#3E8E4F",   # green
    "paper": "#7E57A6",       # purple
    "trial": "#8A6D4B",       # brown
    "patient_org": "#B89B1C",  # gold
    "researcher": "#2A9D8F",  # teal
    "mechanism": "#C94F7C",   # rose
    "asset": "#6B7280",       # grey
}

CONFIDENCE_STYLE = {
    "high": ("High confidence", "#1A7F37", "#DDF4E4"),
    "medium": ("Medium confidence", "#9A6700", "#FFF3CD"),
    "low": ("Low confidence", "#8A3B12", "#FFE8D6"),
}

EVIDENCE_TAG = {
    "observed": "observed — directly supported by the source",
    "inferred": "inferred — suggested by analysis, not directly observed",
}

MAX_GRAPH_NODES = 150

st.set_page_config(
    page_title="AI Atlas — Rare Diseases",
    page_icon="🧬",
    layout="wide",
)

st.markdown(
    """
    <style>
      .block-container { max-width: 1180px; padding-top: 2.5rem; }
      h1, h2, h3 { font-weight: 600; letter-spacing: -0.01em; }
      .atlas-lede { color: #555; font-size: 1.05rem; max-width: 46rem; }
      .node-type-tag {
        display: inline-block; font-size: 0.72rem; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.06em;
        padding: 0.15rem 0.55rem; border-radius: 999px; color: #fff;
      }
      .conf-badge {
        display: inline-block; font-size: 0.75rem; font-weight: 600;
        padding: 0.12rem 0.55rem; border-radius: 999px;
      }
      .ev-tag {
        display: inline-block; font-size: 0.72rem; color: #555;
        border: 1px solid #ddd; border-radius: 999px;
        padding: 0.12rem 0.55rem;
      }
      .edge-card {
        border: 1px solid #e5e5e5; border-radius: 10px;
        padding: 0.8rem 1rem; margin-bottom: 0.7rem; background: #fff;
      }
      .edge-card.contra {
        border: 2px solid #D64545; background: #FFF5F5;
      }
      .edge-rel { font-weight: 600; font-size: 0.95rem; }
      .edge-note { color: #444; margin: 0.25rem 0 0.5rem 0; }
      .edge-meta { font-size: 0.8rem; color: #666; }
      .contra-banner {
        font-weight: 700; color: #B42318; font-size: 0.8rem;
        text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem;
      }
      .tenx-box {
        border-left: 4px solid #2F6FB2; background: #F4F8FD;
        padding: 1rem 1.25rem; border-radius: 0 10px 10px 0; margin: 1rem 0;
      }
      .viable { border-left: 4px solid #1A7F37; padding-left: 0.9rem; margin-bottom: 1rem; }
      .thin { border-left: 4px solid #9A6700; padding-left: 0.9rem; margin-bottom: 1rem; }
      .step-card {
        border: 1px solid #e5e5e5; border-radius: 12px;
        padding: 1.1rem 1.25rem; margin-bottom: 0.9rem; background: #fff;
      }
      .step-num {
        display: inline-block; width: 1.7rem; height: 1.7rem; line-height: 1.7rem;
        text-align: center; border-radius: 999px; background: #2F6FB2; color: #fff;
        font-weight: 700; font-size: 0.85rem; margin-right: 0.6rem;
      }
      .legend-dot { display: inline-block; width: 0.7rem; height: 0.7rem;
                    border-radius: 999px; margin-right: 0.3rem; }
    </style>
    """,
    unsafe_allow_html=True,
)


# --------------------------------------------------------------------------
# Data loading
# --------------------------------------------------------------------------

@st.cache_data(show_spinner=False)
def load_graph() -> dict | None:
    """Return the parsed graph, or None when the graph file is not ready."""
    if not GRAPH_PATH.exists():
        return None
    try:
        with GRAPH_PATH.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return None


def missing_graph_state() -> None:
    st.title("🧬 AI Atlas for the World's Rare Diseases")
    st.subheader("Lysosomal storage diseases")
    st.info(
        "📦 **The knowledge graph is being built right now.**\n\n"
        "Real data from MONDO, HPO, ClinVar, PubMed, ClinicalTrials, "
        "Orphanet and NORD is being pulled and linked. "
        "This page will light up automatically once `data/graph.json` is ready — "
        "just refresh.",
        icon="🔄",
    )
    st.caption(
        "This app shows real data only. Nothing here is mocked, invented, or "
        "placeholder — so an empty atlas right now is the honest state."
    )
    st.stop()


graph = load_graph()
if graph is None:
    missing_graph_state()

nodes: list[dict] = graph.get("nodes", [])
edges: list[dict] = graph.get("edges", [])
clusters: list[dict] = graph.get("clusters", [])
journeys: dict = graph.get("journeys", {})
synonyms: dict = graph.get("synonyms", {})
meta: dict = graph.get("meta", {})

node_by_id: dict[str, dict] = {n["id"]: n for n in nodes}
adj: dict[str, list[dict]] = {}
for e in edges:
    adj.setdefault(e["source"], []).append(e)
    adj.setdefault(e["target"], []).append(e)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def type_tag(node_type: str) -> str:
    color = TYPE_COLORS.get(node_type, "#6B7280")
    return f'<span class="node-type-tag" style="background:{color}">{node_type}</span>'


def conf_badge(conf: str) -> str:
    label, fg, bg = CONFIDENCE_STYLE.get(conf, (conf, "#555", "#eee"))
    return f'<span class="conf-badge" style="color:{fg};background:{bg}">{label}</span>'


def ev_tag(evidence: str) -> str:
    return f'<span class="ev-tag">{EVIDENCE_TAG.get(evidence, evidence)}</span>'


def linkify_ref(source_db: str, source_ref: str) -> str:
    """Render a source reference as a clickable link when it is one."""
    ref = (source_ref or "").strip()
    if not ref:
        return f"_{source_db}_ (no reference recorded)"
    url: str | None = None
    low = ref.lower()
    if low.startswith("http://") or low.startswith("https://"):
        url = ref
    elif low.startswith("pmid:"):
        pmid = ref.split(":", 1)[1].strip()
        url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    elif low.startswith("nct"):
        url = f"https://clinicaltrials.gov/study/{ref}"
    if url:
        return f"[{ref}]({url})"
    return f"{source_db}: `{ref}`"


def humanize_relation(relation: str) -> str:
    return relation.replace("_", " ")


def neighborhood(center_id: str, hops: int = 1) -> tuple[list[str], list[dict]]:
    """Node ids within `hops` of center_id and the edges between them."""
    seen = {center_id}
    frontier = {center_id}
    for _ in range(hops):
        nxt = set()
        for nid in frontier:
            for e in adj.get(nid, []):
                other = e["target"] if e["source"] == nid else e["source"]
                if other not in seen:
                    nxt.add(other)
        seen |= nxt
        frontier = nxt
        if len(seen) > MAX_GRAPH_NODES:
            break
    kept = list(seen)[:MAX_GRAPH_NODES]
    kept_set = set(kept)
    kept_edges = [e for e in edges if e["source"] in kept_set and e["target"] in kept_set]
    return kept, kept_edges


def build_agraph(node_ids: list[str], kept_edges: list[dict], *, highlight: str | None = None):
    a_nodes, a_edges = [], []
    for nid in node_ids:
        n = node_by_id.get(nid)
        if not n:
            continue
        color = TYPE_COLORS.get(n.get("type"), "#6B7280")
        size = 30 if nid == highlight else 22
        a_nodes.append(
            Node(
                id=nid,
                label=n.get("label", nid),
                # title deliberately empty: the component's doubleClick handler
                # runs window.open(title) — any text there opens a broken tab.
                title="",
                color=color,
                shape="dot",
                size=size,
            )
        )
    for e in kept_edges:
        contra = bool(e.get("contradicts"))
        a_edges.append(
            Edge(
                source=e["source"],
                target=e["target"],
                color="#D64545" if contra else "#B9C2CC",
                dashes=bool(contra),
                title=f"{humanize_relation(e.get('relation', ''))}"
                      f"{' — CONTRADICTS other evidence' if contra else ''}",
            )
        )
    config = Config(
        height=520,
        width="100%",
        directed=False,
        physics=True,
        hierarchical=False,
        nodeHighlightBehavior=True,
        highlightColor="#F7A7A6",
    )
    return agraph(nodes=a_nodes, edges=a_edges, config=config)


def resolve_search(query: str) -> tuple[str | None, list[dict]]:
    """Exact synonym hit, else candidate nodes for substring fallback."""
    q = query.strip().lower()
    if not q:
        return None, []
    hit = synonyms.get(q)
    if hit and hit in node_by_id:
        return hit, []
    candidates = []
    for n in nodes:
        hay = " ".join([n.get("label", "")] + list(n.get("synonyms", []))).lower()
        if q in hay and n.get("label"):
            candidates.append(n)
        if len(candidates) >= 8:
            break
    if len(candidates) == 1:
        return candidates[0]["id"], []
    return None, candidates


def no_connection_panel(query: str) -> None:
    st.warning(f"**No supported connection for “{query}”.**", icon="🔎")
    st.markdown(
        """
        The atlas only shows links backed by real evidence from its sources
        (MONDO, HPO, ClinVar, PubMed, ClinicalTrials, Orphanet, NORD). Nothing
        matching your search is connected to anything yet.

        **What evidence could change that** — i.e. what the data team would need
        to add a connection:
        - an ontology identifier (MONDO, HPO, HGNC) or a gene symbol
        - a published paper (PMID) describing the link
        - a registered trial (NCT number)
        - a patient registry or advocacy organization
        - a ClinVar variation record
        """
    )
    if st.button("Try another search", key="no_conn_retry"):
        st.session_state.pop("search_hit", None)
        st.session_state["search_box"] = ""
        st.rerun()


def render_edge_card(e: dict, *, focus_id: str) -> None:
    contra = bool(e.get("contradicts"))
    other_id = e["target"] if e["source"] == focus_id else e["source"]
    other = node_by_id.get(other_id, {})
    other_label = other.get("label", other_id)
    cls = "edge-card contra" if contra else "edge-card"
    banner = '<div class="contra-banner">⚠ Contradictory evidence — shown, never hidden</div>' if contra else ""
    st.markdown(
        f'<div class="{cls}">{banner}'
        f'<div class="edge-rel">{humanize_relation(e.get("relation", "?"))} → {other_label}</div>'
        f'<div class="edge-note">{e.get("note", "")}</div>'
        f'<div>{conf_badge(e.get("confidence", "?"))} &nbsp; {ev_tag(e.get("evidence", "?"))}</div>'
        f'<div class="edge-meta">Source: {linkify_ref(e.get("source_db", ""), e.get("source_ref", ""))}'
        f' &nbsp;·&nbsp; {e.get("date", "")}</div>'
        f"</div>",
        unsafe_allow_html=True,
    )


def node_detail(node_id: str) -> None:
    n = node_by_id.get(node_id)
    if not n:
        st.info("Select a node in the graph to see its details.")
        return
    st.markdown(f"### {n.get('label', node_id)}")
    st.markdown(type_tag(n.get("type", "?")), unsafe_allow_html=True)
    desc = n.get("description", "")
    if desc:
        st.write(desc)
    extra = n.get("extra", {}) or {}
    if extra.get("url"):
        st.link_button("Open source page ↗", extra["url"])
    node_edges = adj.get(node_id, [])
    contra_edges = [e for e in node_edges if e.get("contradicts")]
    plain_edges = [e for e in node_edges if not e.get("contradicts")]
    st.markdown(f"**Connections ({len(node_edges)})**")
    for e in contra_edges + plain_edges:
        render_edge_card(e, focus_id=node_id)
    if st.button("Center graph on this node", key=f"center_{node_id}"):
        st.session_state["focus_node"] = node_id
        st.rerun()


def legend() -> None:
    cols = st.columns(5)
    for i, (t, c) in enumerate(TYPE_COLORS.items()):
        with cols[i % 5]:
            st.markdown(
                f'<span class="legend-dot" style="background:{c}"></span>'
                f'<span style="font-size:0.8rem">{t}</span>',
                unsafe_allow_html=True,
            )


# --------------------------------------------------------------------------
# Header
# --------------------------------------------------------------------------

st.title("🧬 AI Atlas for the World's Rare Diseases")
st.markdown(
    '<p class="atlas-lede">A living map of lysosomal storage diseases — diseases, '
    "genes, symptoms, papers, trials, patient groups and the mechanisms that "
    "connect them. Every link carries its evidence; contradictions are shown, "
    "never hidden.</p>",
    unsafe_allow_html=True,
)
built = meta.get("built_at", "")
src_count = len(meta.get("sources", []))
st.caption(
    f"Slice: {meta.get('slice', 'lysosomal storage diseases')}"
    + (f" · graph built {built}" if built else "")
    + (f" · {src_count} sources" if src_count else "")
    + f" · {len(nodes)} nodes · {len(edges)} edges"
)

# --------------------------------------------------------------------------
# Tabs (segmented control so other tabs can jump here programmatically)
# --------------------------------------------------------------------------

tab = st.segmented_control(
    "Section",
    options=["Explore", "Clusters", "Patient Action", "Maria's Journey"],
    default=st.session_state.get("active_tab", "Explore"),
    label_visibility="collapsed",
)
st.session_state["active_tab"] = tab
st.write("")

# --------------------------------------------------------------------------
# TAB: Explore
# --------------------------------------------------------------------------

if tab == "Explore":
    query = st.text_input(
        "Search disease, gene, symptom, patient group, or mechanism",
        key="search_box",
        placeholder="e.g. Gaucher, GBA, hepatosplenomegaly, ICGG, lysosomal enzyme…",
    )

    hit_id = st.session_state.get("search_hit")
    if query:
        exact, candidates = resolve_search(query)
        if exact:
            hit_id = exact
            st.session_state["search_hit"] = exact
            st.session_state["focus_node"] = exact
        elif candidates:
            hit_id = None
            st.session_state.pop("search_hit", None)
            st.info("Several nodes match — pick one:")
            cols = st.columns(min(len(candidates), 4))
            for i, c in enumerate(candidates):
                with cols[i % 4]:
                    if st.button(c["label"], key=f"cand_{c['id']}"):
                        st.session_state["search_hit"] = c["id"]
                        st.session_state["focus_node"] = c["id"]
                        st.rerun()
        else:
            hit_id = None
            st.session_state.pop("search_hit", None)
            no_connection_panel(query)

    focus = st.session_state.get("focus_node")
    if focus and focus not in node_by_id:
        focus = None

    if not focus:
        # Default overview: disease nodes (capped) + edges among them.
        disease_ids = [n["id"] for n in nodes if n.get("type") == "disease"][:40]
        if not disease_ids:
            disease_ids = [n["id"] for n in nodes[:40]]
        node_ids = disease_ids[:MAX_GRAPH_NODES]
        idset = set(node_ids)
        kept_edges = [e for e in edges if e["source"] in idset and e["target"] in idset]
        st.caption("Overview — disease nodes. Search above, or click a node, to dig in.")
    else:
        node_ids, kept_edges = neighborhood(focus, hops=1)
        fn = node_by_id[focus]
        st.caption(
            f"Showing **{fn.get('label', focus)}** and its 1-hop neighborhood "
            f"({len(node_ids)} nodes, {len(kept_edges)} edges)."
        )

    left, right = st.columns([2, 1])
    with left:
        legend()
        selection = build_agraph(node_ids, kept_edges, highlight=focus)
        # agraph returns the clicked node's id as a plain string (or None).
        if selection and selection != st.session_state.get("detail_node"):
            st.session_state["detail_node"] = selection
            st.rerun()
    with right:
        st.subheader("Details")
        detail_id = st.session_state.get("detail_node") or focus
        if detail_id:
            node_detail(detail_id)
        else:
            st.info(
                "Click any node in the graph to see its description and every connection, "
                "with sources, confidence, and contradictions."
            )

# --------------------------------------------------------------------------
# TAB: Clusters
# --------------------------------------------------------------------------

elif tab == "Clusters":
    st.header("Disease clusters")
    st.markdown(
        '<p class="atlas-lede">Groups of diseases the data links together — by shared '
        "mechanism, shared genes, or shared reusable assets like registries and "
        "trial designs.</p>",
        unsafe_allow_html=True,
    )
    if not clusters:
        st.info("No clusters have been computed yet — the graph is still being assembled.")
    for c in clusters:
        members = [node_by_id.get(m, {}).get("label", m) for m in c.get("members", [])]
        with st.container(border=True):
            st.subheader(c.get("label", f"Cluster {c.get('id')}"))
            st.write(c.get("summary", ""))
            cols = st.columns(2)
            with cols[0]:
                st.markdown("**Shared mechanism**")
                st.write(c.get("shared_mechanism", "—"))
                st.markdown("**Members**")
                st.write(", ".join(members) if members else "—")
            with cols[1]:
                st.markdown("**Reusable assets**")
                for a in c.get("reusable_assets", []) or ["—"]:
                    st.write(f"• {a}")
                st.markdown("**Gaps**")
                for g in c.get("gaps", []) or ["—"]:
                    st.write(f"• {g}")
            st.markdown("**Next experiment**")
            st.info(c.get("next_experiment", "—"))
            if st.button("Open in Explore →", key=f"cluster_open_{c.get('id')}"):
                first = (c.get("members", []) or [None])[0]
                if first:
                    st.session_state["focus_node"] = first
                    st.session_state["detail_node"] = first
                st.session_state["active_tab"] = "Explore"
                st.rerun()

# --------------------------------------------------------------------------
# TAB: Patient Action
# --------------------------------------------------------------------------

elif tab == "Patient Action":
    st.header("Patient Action")
    st.markdown(
        '<p class="atlas-lede">For a chosen disease: what exists today that a patient '
        "community could actually use — and what is still unsupported. "
        "**Viable leads** rest on observed, higher-confidence evidence. "
        "**Thin links** are inferred or low-confidence: interesting, not actionable.</p>",
        unsafe_allow_html=True,
    )
    disease_nodes = [n for n in nodes if n.get("type") == "disease"]
    if not disease_nodes:
        st.info("No disease nodes in the graph yet.")
        st.stop()
    labels = {n["id"]: n.get("label", n["id"]) for n in disease_nodes}
    sel_label = st.selectbox("Disease", options=[labels[n["id"]] for n in disease_nodes])
    sel_id = next(nid for nid, lab in labels.items() if lab == sel_label)
    sel_node = node_by_id[sel_id]

    def viable(e: dict) -> bool:
        return e.get("evidence") == "observed" and e.get("confidence") in ("high", "medium")

    node_edges = adj.get(sel_id, [])
    assets, trials_papers, orgs, others = [], [], [], []
    for e in node_edges:
        other_id = e["target"] if e["source"] == sel_id else e["source"]
        otype = node_by_id.get(other_id, {}).get("type", "")
        bucket = (
            assets if otype == "asset"
            else trials_papers if otype in ("trial", "paper")
            else orgs if otype == "patient_org"
            else others
        )
        bucket.append((e, other_id))

    cl = next((c for c in clusters if sel_id in c.get("members", [])), None)

    st.subheader("Shared assets")
    if assets or (cl and cl.get("reusable_assets")):
        for e, oid in sorted(assets, key=lambda x: not viable(x[0])):
            cls = "viable" if viable(e) else "thin"
            tag = "✅ viable lead" if viable(e) else "🟡 thin link — needs evidence"
            st.markdown(
                f'<div class="{cls}"><strong>{node_by_id.get(oid, {}).get("label", oid)}</strong> '
                f"— {tag}<br><span style='color:#555'>{e.get('note', '')}</span><br>"
                f"<span style='font-size:0.8rem;color:#777'>"
                f"{linkify_ref(e.get('source_db', ''), e.get('source_ref', ''))}</span></div>",
                unsafe_allow_html=True,
            )
        if cl:
            for a in cl.get("reusable_assets", []) or []:
                st.markdown(f'<div class="viable">📦 <strong>{a}</strong> — cluster-level reusable asset</div>',
                            unsafe_allow_html=True)
    else:
        st.write("No shared assets connected to this disease yet.")

    st.subheader("Possible clinical pathways")
    if trials_papers:
        for e, oid in sorted(trials_papers, key=lambda x: not viable(x[0])):
            o = node_by_id.get(oid, {})
            cls = "viable" if viable(e) else "thin"
            tag = "✅ viable lead" if viable(e) else "🟡 thin link — needs evidence"
            st.markdown(
                f'<div class="{cls}"><strong>{o.get("label", oid)}</strong> '
                f"{type_tag(o.get('type', ''))} — {tag}<br>"
                f"<span style='color:#555'>{e.get('note', '')}</span><br>"
                f"<span style='font-size:0.8rem;color:#777'>"
                f"{linkify_ref(e.get('source_db', ''), e.get('source_ref', ''))}</span></div>",
                unsafe_allow_html=True,
            )
    else:
        st.write("No trials or papers connected to this disease yet.")

    st.subheader("Partner organizations")
    if orgs:
        for e, oid in orgs:
            o = node_by_id.get(oid, {})
            st.write(f"• **{o.get('label', oid)}** — {e.get('note', '')}")
            extra = o.get("extra", {}) or {}
            if extra.get("url"):
                st.link_button(f"Visit {o.get('label', '')} ↗", extra["url"], key=f"org_{oid}")
    else:
        st.write("No patient organizations connected yet.")

    st.subheader("Next experiments")
    if cl and cl.get("next_experiment"):
        st.info(cl["next_experiment"])
    else:
        st.write("No next-experiment proposals recorded for this disease's cluster yet.")
    if others:
        with st.expander(f"Other connections ({len(others)})"):
            for e, _ in others:
                render_edge_card(e, focus_id=sel_id)

# --------------------------------------------------------------------------
# TAB: Maria's Journey
# --------------------------------------------------------------------------

else:
    st.header("Maria's Journey")
    maria = journeys.get("maria")
    if not maria:
        st.info(
            "Maria's guided journey isn't in the graph yet — the graph team is still "
            "assembling it. Check back after the next data build."
        )
        st.stop()

    steps: list[dict] = maria.get("steps", [])
    start = maria.get("start")
    start_label = node_by_id.get(start, {}).get("label", start) if start else ""
    st.markdown(
        '<p class="atlas-lede">A guided walkthrough: how shared data and reusable '
        f"assets could change the story for someone like Maria, starting from "
        f"**{start_label}**.</p>",
        unsafe_allow_html=True,
    )

    idx = st.session_state.get("maria_step", 0)
    idx = max(0, min(idx, max(len(steps) - 1, 0)))
    if steps:
        s = steps[idx]
        n = node_by_id.get(s.get("node"), {})
        st.markdown(
            f'<div class="step-card"><span class="step-num">{idx + 1}</span>'
            f"<strong style='font-size:1.15rem'>{n.get('label', s.get('node', '?'))}</strong> "
            f"{type_tag(n.get('type', '')) if n else ''}"
            f"<p style='margin-top:0.6rem'><strong>Why this step matters:</strong> {s.get('why', '')}</p>"
            f"<p><strong>Supporting evidence:</strong> {s.get('edge_note', '')}</p></div>",
            unsafe_allow_html=True,
        )
        if n.get("description"):
            st.caption(n["description"])
        c1, c2, c3 = st.columns([1, 1, 4])
        with c1:
            if st.button("← Back", disabled=idx == 0, key="maria_back"):
                st.session_state["maria_step"] = idx - 1
                st.rerun()
        with c2:
            if st.button("Next →", disabled=idx >= len(steps) - 1, key="maria_next"):
                st.session_state["maria_step"] = idx + 1
                st.rerun()
        with c3:
            st.caption(f"Step {idx + 1} of {len(steps)}")
        st.progress((idx + 1) / len(steps))
    else:
        st.info("Journey steps are still being written.")

    st.subheader("The 10× case")
    st.markdown(
        f'<div class="tenx-box">{maria.get("ten_x_case", "—")}</div>',
        unsafe_allow_html=True,
    )
    st.subheader("Assumptions — stated, not hidden")
    for a in maria.get("assumptions", []) or ["—"]:
        st.write(f"• {a}")
