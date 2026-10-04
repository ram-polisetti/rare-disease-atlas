#!/usr/bin/env python3
"""Idempotent post-build normalization. Run after building site/graph.json.
Only identical normalized labels merge. Qualifiers retain separate HPO records.
Near spelling matches are reported for review, never automatically merged.
"""
import argparse, collections, difflib, itertools, json, re
from pathlib import Path

def normalized(label):
    return re.sub(r'[^a-z0-9]', '', label.lower())

def family_key(label):
    qualifiers = {'recurrent','unexplained','chronic','progressive','severe','mild','profound','generalized','bilateral','episodic','intermittent','spontaneous','diffuse','early','late','neonatal','infantile','proximal','distal','upper','lower','limb'}
    words = re.findall(r'[a-z0-9]+', label.lower())
    return ' '.join(w[:-1] if w.endswith('s') and not w.endswith(('ss','sis')) else w for w in words if w not in qualifiers)

def audit(path, report):
    graph = json.loads(path.read_text())
    merges, mapping = [], {}
    groups = collections.defaultdict(list)
    for node in graph['nodes']:
        if node['type'] in ('phenotype','gene','mechanism'):
            groups[(node['type'], normalized(node['label']))].append(node)
    for (kind, key), nodes in groups.items():
        if len(nodes) < 2: continue
        nodes.sort(key=lambda n: (not n['id'].startswith('HP:'), len(n['label']), n['id']))
        keeper = nodes[0]
        keeper['synonyms'] = sorted(set(itertools.chain.from_iterable([n.get('synonyms', []) + [n['label']] for n in nodes])) - {keeper['label']})
        keeper.setdefault('extra', {})['merged_ids'] = sorted(set(keeper['extra'].get('merged_ids', []) + [n['id'] for n in nodes[1:]]))
        for n in nodes[1:]: mapping[n['id']] = keeper['id']
        merges.append((kind, keeper['id'], [n['id'] for n in nodes[1:]]))
    graph['nodes'] = [n for n in graph['nodes'] if n['id'] not in mapping]
    for e in graph['edges']:
        e['source'] = mapping.get(e['source'], e['source']); e['target'] = mapping.get(e['target'], e['target'])
    # Keep distinct evidence records; remove only completely identical edges.
    graph['edges'] = list({json.dumps(e, sort_keys=True): e for e in graph['edges']}.values())
    for c in graph.get('clusters', []): c['members'] = list(dict.fromkeys(mapping.get(i,i) for i in c.get('members', [])))
    if isinstance(graph.get('synonyms'), dict):
        for k,v in graph['synonyms'].items():
            if isinstance(v,str): graph['synonyms'][k] = mapping.get(v,v)
    phenos = [n for n in graph['nodes'] if n['type'] == 'phenotype']
    families = collections.defaultdict(list)
    for n in phenos: families[family_key(n['label'])].append(n)
    families = {k:v for k,v in families.items() if len(v)>1 and k}
    graph['phenotype_families'] = [{'label': k, 'members': sorted(n['id'] for n in ns)} for k,ns in sorted(families.items())]
    existing = {(e['source'],e['target'],e['relation']) for e in graph['edges']}
    added = 0
    for key, ns in sorted(families.items()):
        for a,b in itertools.combinations(sorted(ns,key=lambda n:n['id']),2):
            if (a['id'],b['id'],'related_phenotype') in existing: continue
            graph['edges'].append({'source':a['id'],'target':b['id'],'relation':'related_phenotype','source_db':'Atlas phenotype label audit','source_ref':'reports/phenotype-audit.md','evidence':'inferred','confidence':'low','note':'Related label family: '+key+'. Qualifiers remain clinically distinct; this does not establish equivalence.','date':'2026-10-04'})
            added += 1
    near = []
    member_pairs = {tuple(sorted((a['id'],b['id']))) for ns in families.values() for a,b in itertools.combinations(ns,2)}
    for a,b in itertools.combinations(phenos,2):
        if tuple(sorted((a['id'],b['id']))) in member_pairs: continue
        ka,kb=normalized(a['label']),normalized(b['label'])
        if min(len(ka),len(kb)) >= 8 and difflib.SequenceMatcher(None,ka,kb).ratio() >= .88:
            near.append((a,b))
    lines=['# Phenotype audit, 2026-10-04','',f'Audited {len(phenos)} phenotype nodes and all gene/mechanism labels. Exact duplicates merged: {len(mapping)}. Related label families: {len(families)}. Related edges added this run: {added}.','', 'Normalization: lowercase, remove punctuation and whitespace. Only exact matches merge, preserving all distinct evidence records and synonyms. Qualifier stripping finds related families, never equivalence. Similarity candidates (threshold 0.88) remain separate pending clinical review.','', '## Exact merges','',str(merges) if merges else 'None found in this snapshot.','', '## Full related-family cluster list','']
    for key,ns in sorted(families.items()): lines.append('- '+key+': '+ '; '.join(n['label']+' (`'+n['id']+'`)' for n in ns))
    lines += ['', '## Additional near-label candidates, retained separately','']
    for a,b in near: lines.append('- '+a['label']+' (`'+a['id']+'`) / '+b['label']+' (`'+b['id']+'`)')
    lines += ['', '## Rebuild rule','', 'Run `python3 scripts/audit_phenotypes.py` after any graph build or merge. The operation is idempotent. The Guide expands matched phenotype IDs through these recorded families and scores each family once per disease. Broad queries such as fever therefore include recurrent and unexplained fever without merging their HPO concepts.']
    report.write_text('\n'.join(lines)+'\n');path.write_text(json.dumps(graph,ensure_ascii=False,indent=2)+'\n')
    print(lines[2])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--graph',type=Path,default=Path('site/graph.json'));p.add_argument('--report',type=Path,default=Path('reports/phenotype-audit.md'));a=p.parse_args();audit(a.graph,a.report)
