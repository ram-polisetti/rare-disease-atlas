#!/usr/bin/env python3
"""Fix 2: recompute clusters on the MECHANISM-ONLY subgraph.

Projection: node types {disease, gene, variant, phenotype, mechanism} and only
biological relations. Drops funding/org/trial/literature edges that contaminate
Louvain with non-biological signal. Compares against current clusters, then
rewrites the clusters array + node cluster_id fields in data/graph.json.
"""
import json
from collections import Counter, defaultdict

import networkx as nx
import community as community_louvain

REPO = '/home/hatch/workspace/hack-nation-rare-disease-atlas'
g = json.load(open(f'{REPO}/data/graph.json'))
nb = {n['id']: n for n in g['nodes']}

BIO_TYPES = {'disease', 'gene', 'variant', 'phenotype', 'mechanism'}
BIO_RELATIONS = {
    'has_mechanism', 'disrupts_pathway', 'part_of', 'shares_pathway',
    'caused_by_variant_in', 'associated_with_gene', 'variant_of',
    'has_phenotype', 'presents_with', 'associated_with',
    'susceptibility_factor_for',
}

G = nx.Graph()
bio_nodes = [n['id'] for n in g['nodes'] if n['type'] in BIO_TYPES]
G.add_nodes_from(bio_nodes)
# Mechanism/pathway edges carry more community signal than shared phenotypes
# (2057 has_phenotype edges would otherwise drown the 73 mechanism edges).
WEIGHTS = {
    'has_mechanism': 5, 'disrupts_pathway': 5, 'part_of': 3,
    'shares_pathway': 3, 'caused_by_variant_in': 3,
    'associated_with_gene': 2, 'associated_with': 2,
    'susceptibility_factor_for': 2,
    'variant_of': 1, 'has_phenotype': 1, 'presents_with': 1,
}
kept, dropped = 0, 0
for e in g['edges']:
    s, t = e['source'], e['target']
    if (nb.get(s, {}).get('type') in BIO_TYPES and nb.get(t, {}).get('type') in BIO_TYPES
            and e['relation'] in BIO_RELATIONS):
        w = WEIGHTS.get(e['relation'], 1)
        if G.has_edge(s, t):
            G[s][t]['weight'] += w
        else:
            G.add_edge(s, t, weight=w)
        kept += 1
    else:
        dropped += 1
print(f'projection: {G.number_of_nodes()} nodes, {G.number_of_edges()} bio edges (dropped {dropped} non-bio)')

# Louvain, same params as build_graph.py (resolution 1.0, seed 42), weighted.
part = community_louvain.best_partition(G, resolution=1.0, random_state=42, weight='weight')
new_clusters = defaultdict(list)
for nid, cid in part.items():
    new_clusters[cid].append(nid)
print(f'new: {len(new_clusters)} clusters, modularity {community_louvain.modularity(part, G, weight="weight"):.4f}')

# Compare with current clusters (only over bio nodes that had a cluster_id)
old_of = {n['id']: n.get('cluster_id') for n in g['nodes'] if n['type'] in BIO_TYPES and n.get('cluster_id') is not None}
# Adjusted Rand-ish: for each new cluster, what fraction of members shared the dominant old cluster?
for cid in sorted(new_clusters):
    members = new_clusters[cid]
    old = Counter(old_of.get(m) for m in members if m in old_of)
    dom, domn = old.most_common(1)[0] if old else (None, 0)
    types = Counter(nb[m]['type'] for m in members)
    genes = sorted({nb[m]['label'] for m in members if nb[m]['type'] == 'gene'})
    mechs = sorted({nb[m]['label'] for m in members if nb[m]['type'] == 'mechanism'})
    print(f'new cluster {cid}: {len(members)} members, dominant old={dom} ({domn}/{len(members)}), '
          f'types={dict(types)}, genes={genes}, mech={mechs}')

# Map old cluster metadata onto new clusters by majority overlap of disease members
old_clusters = {c['id']: c for c in g['clusters']}
new2old = {}
for cid, members in new_clusters.items():
    diseases = [m for m in members if nb[m]['type'] == 'disease' and m in old_of]
    if diseases:
        new2old[cid] = Counter(old_of[m] for m in diseases).most_common(1)[0][0]

def cluster_label(cid, members):
    genes = sorted({nb[m]['label'] for m in members if nb[m]['type'] == 'gene'})
    mechs = sorted({nb[m]['label'] for m in members if nb[m]['type'] == 'mechanism'})
    core = (mechs[0] if mechs else 'Lysosomal mechanism')
    if genes:
        return f'{core} ({", ".join(genes[:6])})'
    return f'{core} (no genes)'

out_clusters = []
for cid in sorted(new_clusters):
    members = sorted(new_clusters[cid])
    old = old_clusters.get(new2old.get(cid), {})
    out_clusters.append({
        'id': cid,
        'label': old.get('label') or cluster_label(cid, members),
        'summary': old.get('summary') or '',
        'members': members,
        'shared_mechanism': old.get('shared_mechanism') or '',
        'reusable_assets': old.get('reusable_assets') or [],
        'gaps': old.get('gaps') or [],
        'next_experiment': old.get('next_experiment') or '',
        'method': 'louvain-on-mechanism-only-subgraph',
    })

# Rewrite cluster_id on nodes (bio nodes get new ids; others keep theirs)
for n in g['nodes']:
    if n['id'] in part:
        n['cluster_id'] = part[n['id']]

g['clusters'] = out_clusters
g['meta']['clustering'] = {
    'method': 'Louvain (resolution 1.0, seed 42, weighted) on mechanism-only projection: '
              'node types {disease, gene, variant, phenotype, mechanism}, biological relations only; '
              'funding/org/trial/literature edges excluded to avoid non-biological signal. '
              'Edge weights: mechanism/pathway relations x5/x3, gene-disease x2-3, phenotype x1 '
              '(2057 has_phenotype edges would otherwise drown the 73 mechanism edges).',
    'modularity': round(community_louvain.modularity(part, G, weight='weight'), 4),
    'n_clusters': len(out_clusters),
    'recomputed': '2026-10-03',
}
json.dump(g, open(f'{REPO}/data/graph.json', 'w'))
json.dump(g, open(f'{REPO}/site/graph.json', 'w'))
print('rewrote clusters in data/graph.json + site/graph.json:', len(out_clusters))
