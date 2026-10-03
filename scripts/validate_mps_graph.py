#!/usr/bin/env python3
"""Validate the graph contract, MPS expansion and optional pre-pull raw snapshot."""
import hashlib
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
graph = json.loads((ROOT / 'data/graph.json').read_text())
report = json.loads((ROOT / 'data/processed/mps_expansion_report.json').read_text())
nodes = {n['id']: n for n in graph['nodes']}
assert len(nodes) == len(graph['nodes']), 'Duplicate node IDs'
node_fields = {'id', 'type', 'label', 'synonyms', 'description', 'cluster_id', 'extra'}
edge_fields = {'source', 'target', 'relation', 'evidence', 'confidence', 'source_db',
               'source_ref', 'date', 'note', 'contradicts'}
types = {'disease', 'gene', 'variant', 'phenotype', 'paper', 'trial', 'patient_org',
         'researcher', 'mechanism', 'asset'}
clusters = {c['id']: c for c in graph['clusters']}
for n in nodes.values():
    assert node_fields <= n.keys(), n['id']
    assert n['type'] in types and isinstance(n['label'], str)
    assert isinstance(n['description'], str) and isinstance(n['synonyms'], list)
    assert all(isinstance(s, str) for s in n['synonyms'])
    assert isinstance(n['extra'], dict) and n['cluster_id'] in clusters
    assert n['id'] in clusters[n['cluster_id']]['members']
for e in graph['edges']:
    assert edge_fields <= e.keys(), e
    assert e['source'] in nodes and e['target'] in nodes, e
    assert e['evidence'] in ['observed', 'inferred']
    assert e['confidence'] in ['high', 'medium', 'low']
    assert isinstance(e['contradicts'], bool)
    for key in ['relation', 'source_db', 'source_ref', 'date', 'note']:
        assert isinstance(e[key], str) and e[key], (key, e)
    assert e['date'] == '2026-10-03'
assert any(e['contradicts'] for e in graph['edges'])
assert set(nodes) == {nid for c in clusters.values() for nid in c['members']}
assert sum(len(c['members']) for c in clusters.values()) == len(nodes)
triples = {(e['source'], e['target'], e['relation']) for e in graph['edges']}
gag = 'atlas:mech-glycosaminoglycan-catabolism'
for gene, mid in report['diseases'].items():
    gid = report['genes'][gene]['id']
    assert nodes[mid]['type'] == 'disease' and nodes[gid]['label'] == gene
    assert (mid, gid, 'caused_by_variant_in') in triples
    assert (mid, gag, 'has_mechanism') in triples
    assert any(e['source'] == mid and e['relation'] == 'has_phenotype' for e in graph['edges'])
    assert sum(e['target'] == gid and e['relation'] == 'variant_of' for e in graph['edges']) == 10
    assert (mid, 'atlas:org-national-mps-society', 'advocated_by') in triples
    mechanism_edge = next(e for e in graph['edges'] if e['source'] == gid and e['target'] == gag)
    assert mechanism_edge['evidence'] == 'inferred' and mechanism_edge['confidence'] == 'medium'
    assert graph['synonyms'][gene.lower()] == gid
for a, b in itertools.combinations(list(report['diseases'].values()) + ['MONDO:0001586'], 2):
    assert (a, b, 'shares_pathway') in triples or (b, a, 'shares_pathway') in triples
journey = graph['journeys']['maria']
assert journey['start'] == report['diseases']['SGSH']
assert len(journey['steps']) == 8 and len(journey['assumptions']) >= 4
for st in journey['steps']:
    assert {'node', 'why', 'edge_note'} <= st.keys() and st['node'] in nodes
for a, b in zip(journey['steps'], journey['steps'][1:]):
    assert any({e['source'], e['target']} == {a['node'], b['node']} for e in graph['edges']), (a, b)
assert 'estimates' in journey['ten_x_case'].lower()
assert 'no fda-approved' not in json.dumps(journey).lower()
assert nodes['atlas:asset-cross-disease-proposal']['cluster_id'] == nodes['atlas:asset-mps-natural-history-design']['cluster_id']
assert len(nodes['atlas:asset-mps-natural-history-design']['extra']['eligibility_deltas']) >= 4
baseline_path = Path('/tmp/mps_raw_baseline.json')
if baseline_path.exists():
    baseline = json.loads(baseline_path.read_text())
    def retained(old, new):
        if isinstance(old, list):
            return new[:len(old)] == old
        if isinstance(old, dict):
            return all(k in new and (k.startswith('n_') or retained(v, new[k])) for k, v in old.items())
        return old == new
    for filename, old in baseline.items():
        p = ROOT / 'data/raw' / filename
        if isinstance(old, dict):
            assert retained(old, json.loads(p.read_text())), 'Changed old raw record: ' + filename
        elif filename == 'pubmed_abstracts.jsonl':
            prefix = b''.join(p.read_bytes().splitlines(keepends=True)[:478])
            assert hashlib.sha256(prefix).hexdigest() == old, 'Changed original PubMed bytes'
        else:
            assert hashlib.sha256(p.read_bytes()).hexdigest() == old, 'Changed raw source: ' + filename
    print('PASS: all pre-existing raw records retained; immutable sources and PubMed prefix unchanged')
print('PASS: node/edge contract, references, clusters, five gene/disease pairs, phenotypes, variants, pathways and journey links')
print(json.dumps({'nodes': len(nodes), 'edges': len(graph['edges']), 'louvain': graph['meta']['louvain'],
                  'journey': [nodes[s['node']]['label'] for s in journey['steps']]}, indent=1))
