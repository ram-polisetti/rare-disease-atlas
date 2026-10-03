#!/usr/bin/env python3
"""Append the MPS II/III slice without replacing existing raw records.

No model endpoints are used. Network sources are Monarch, NCBI and CT.gov.
NCBI_EMAIL may override the project contact identifier sent to E-utilities.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import pull_monarch as monarch
import pull_pubmed as pubmed
import pull_clinvar as clinvar
import pull_clinicaltrials as trials

ROOT = Path(__file__).resolve().parents[1]
DATE = '2026-10-03'
GENES = ['IDS', 'SGSH', 'NAGLU', 'HGSNAT', 'GNS']
DISEASES = {g: label for g, label in zip(GENES, [
    'mucopolysaccharidosis type 2', 'mucopolysaccharidosis type 3A',
    'mucopolysaccharidosis type 3B', 'mucopolysaccharidosis type 3C',
    'mucopolysaccharidosis type 3D'])}
report = {'retrieved': DATE, 'failures': [], 'queries': [], 'added': {}}


def read(path):
    return json.loads((ROOT / path).read_text())


def write_processed(path, data):
    (ROOT / path).write_text(json.dumps(data, indent=1) + '\n')


def append_field(path, key, additions, count_key=None):
    """Insert at the end of an existing JSON array/object, retaining old bytes."""
    p = ROOT / path
    text = p.read_text()
    match = re.search(r'"' + re.escape(key) + r'"\s*:\s*', text)
    start = match.end()
    old, length = json.JSONDecoder().raw_decode(text[start:])
    if not additions:
        return
    end = start + length - 1
    payload = json.dumps(additions, indent=1)[1:-1].strip()
    text = text[:end] + (',' if old else '') + '\n' + payload + '\n' + text[end:]
    if count_key:
        text = re.sub(r'("' + count_key + r'"\s*:\s*)\d+',
                      lambda m: m[1] + str(len(old) + len(additions)), text, count=1)
    json.loads(text)  # Validate before changing the file.
    p.write_text(text)


last_request = 0
def request(url, params=None, xml=False):
    global last_request
    if params:
        params = dict(params)
        if 'eutils.ncbi.nlm.nih.gov' in url:
            params.update(tool='rare-disease-atlas', email=os.environ.get(
                'NCBI_EMAIL', 'rare-disease-atlas@example.org'))
        url += '?' + urllib.parse.urlencode(params)
    for attempt in range(3):
        time.sleep(max(0, 0.4 - (time.monotonic() - last_request)))
        last_request = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'rare-disease-atlas/1.0', 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = response.read()
            report['queries'].append(url)
            return raw if xml else json.loads(raw)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def eutils(path, params, **kwargs):
    return request('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/' + path,
                   params, xml=True)


def attempt(label, work):
    try:
        return work()
    except Exception as exc:
        report['failures'].append({'source': label, 'error': str(exc)})
        print(label, 'FAILED', exc, flush=True)
        return None


def main():
    # Semantic snapshot plus immutable-file digests for subsequent preservation checks.
    baseline = {p.name: (json.loads(p.read_text()) if p.suffix == '.json' and
                p.name not in ['mondo.json', 'hp.json'] else hashlib.sha256(p.read_bytes()).hexdigest())
                for p in (ROOT / 'data/raw').iterdir() if p.is_file()}
    Path('/tmp/mps_raw_baseline.json').write_text(json.dumps(baseline))
    before = read('data/graph.json')
    report['before'] = {'nodes': len(before['nodes']), 'edges': len(before['edges'])}
    pubmed.eutils = eutils
    clinvar.eutils = eutils
    monarch.get = lambda path, params=None: request(monarch.BASE + path, params)
    ontology = read('data/raw/mondo.json')['graphs'][0]
    by_label = {n.get('lbl'): n for n in ontology['nodes'] if not n.get('meta', {}).get('deprecated')}
    selected = [n for label, n in by_label.items() if label and
                (label in DISEASES.values() or label == 'mucopolysaccharidosis type 3' or
                 label.startswith('mucopolysaccharidosis type 2,'))]
    diseases = read('data/processed/mondo_slice_diseases.json')
    known = {d['mondo_id'] for d in diseases['diseases']}
    for n in selected:
        mid = n['id'].rsplit('/', 1)[-1].replace('_', ':')
        if mid in known:
            continue
        meta = n.get('meta', {})
        diseases['diseases'].append({'mondo_id': mid, 'label': n['lbl'],
            'synonyms': [s['val'] for s in meta.get('synonyms', [])],
            'xrefs': [x['val'] for x in meta.get('xrefs', [])],
            'definition': meta.get('definition', {}).get('val'),
            'source': 'MONDO local OBO-Graphs release', 'retrieved': DATE})
    diseases['n_diseases'] = len(diseases['diseases'])
    write_processed('data/processed/mondo_slice_diseases.json', diseases)
    report['diseases'] = {g: by_label[label]['id'].rsplit('/', 1)[-1].replace('_', ':')
                          for g, label in DISEASES.items()}
    report['slice_diseases'] = [d for d in diseases['diseases'] if d['mondo_id'] not in known]
    raw = read('data/raw/monarch_gene_disease_associations.json')
    gene_map, assocs = {}, []
    seen = {(a['subject'], a['predicate'], a['object']) for a in raw['associations']}
    for gene in GENES:
        resolved = attempt('Monarch gene ' + gene, lambda: monarch.resolve_gene(gene))
        if not resolved:
            raise RuntimeError('Cannot resolve HGNC ID for ' + gene)
        gid, name = resolved
        gene_map[gene] = {'id': gid, 'name': name}
        for cat in ['biolink:CausalGeneToDiseaseAssociation', 'biolink:CorrelatedGeneToDiseaseAssociation']:
            result = attempt('Monarch associations ' + gene + ' ' + cat,
                lambda: monarch.get('/association', {'subject': gid, 'category': cat, 'limit': 100}))
            for a in (result or {}).get('items', []):
                key = (a['subject'], a['predicate'], a['object'])
                if key in seen:
                    continue
                seen.add(key)
                a.update(_gene_symbol=gene, _retrieved=DATE, _source='Monarch Biolink API v3')
                assocs.append(a)
                mid = a['object']
                if mid.startswith('MONDO:') and mid not in {d['mondo_id'] for d in diseases['diseases']}:
                    n = next((n for n in ontology['nodes'] if n['id'].endswith(mid.replace(':', '_'))), None)
                    if n:
                        meta = n.get('meta', {})
                        diseases['diseases'].append({'mondo_id': mid, 'label': n['lbl'],
                            'synonyms': [s['val'] for s in meta.get('synonyms', [])],
                            'xrefs': [x['val'] for x in meta.get('xrefs', [])],
                            'definition': meta.get('definition', {}).get('val'),
                            'source': 'MONDO local OBO-Graphs release', 'retrieved': DATE})
        print(gene, gid, 'Monarch complete', flush=True)
    append_field('data/raw/monarch_gene_disease_associations.json', 'genes',
                 {g: d for g, d in gene_map.items() if g not in raw['genes']})
    append_field('data/raw/monarch_gene_disease_associations.json', 'associations', assocs, 'n_associations')
    report['genes'] = gene_map
    report['added']['monarch'] = len(assocs)
    diseases['n_diseases'] = len(diseases['diseases'])
    write_processed('data/processed/mondo_slice_diseases.json', diseases)
    variants, processed = [], read('data/processed/clinvar_slice_variants.json')
    known_variants = {v['clinvar_id'] for v in read('data/raw/clinvar_variants.json')['records']}
    for gene in GENES:
        def pull_variants():
            ids, count = clinvar.esearch('clinvar', f'{gene}[gene] AND ("pathogenic"[Clinical significance] OR "likely pathogenic"[Clinical significance])', retmax=80)
            return [clinvar.parse_variant(gene, s) for s in clinvar.esummary('clinvar', ids)] if ids else []
        records = attempt('ClinVar ' + gene, pull_variants) or []
        variants.extend(v for v in records if v['clinvar_id'] not in known_variants)
        processed['genes'][gene] = sorted(records, key=lambda v: (
            0 if 'pathogenic' in v['clinical_significance'].lower() and 'likely' not in v['clinical_significance'].lower() else 1,
            v['clinvar_id']))[:10]
        print(gene, len(records), 'ClinVar records', flush=True)
    append_field('data/raw/clinvar_variants.json', 'records', variants, 'n_records')
    write_processed('data/processed/clinvar_slice_variants.json', processed)
    report['added']['clinvar'] = len(variants)
    pm_path = ROOT / 'data/raw/pubmed_abstracts.jsonl'
    pmids = {json.loads(line)['pmid'] for line in pm_path.read_text().splitlines()}
    total = 0
    entities = [(g, g, 'gene') for g in ['SGSH', 'NAGLU', 'HGSNAT', 'GNS', 'IDS']] + [
        (term, term, 'disease') for term in ['mucopolysaccharidosis type III', 'Sanfilippo syndrome',
        'Hunter syndrome', 'mucopolysaccharidosis type II']]
    with pm_path.open('a') as fh:
        for label, term, kind in entities:
            def pull_papers():
                query = f'"{term}"[gene]' if kind == 'gene' else f'"{term}"[Title/Abstract]'
                ids = pubmed.esearch_pm(query + ' AND review[pt]', 25)
                if len(ids) < 10:
                    ids += [i for i in pubmed.esearch_pm(query, 25) if i not in ids]
                ids = [i for i in ids[:25] if i not in pmids]
                return pubmed.efetch_abstracts(ids) if ids else []
            records = attempt('PubMed ' + label, pull_papers) or []
            for r in records:
                if r['pmid'] in pmids:
                    continue
                r.update(query_entity=label, entity_type=kind)
                fh.write(json.dumps(r) + '\n')
                pmids.add(r['pmid']); total += 1
            fh.flush()
            print(label, len(records), 'new abstracts', flush=True)
    report['added']['pubmed'] = total
    existing = read('data/raw/clinicaltrials.json')
    seen_trials = {t['nct_id'] for t in existing['trials']}
    new_trials = []
    for gene, label in DISEASES.items():
        query_label = 'Mucopolysaccharidosis type ' + ('II' if gene == 'IDS' else 'III' + label[-1])
        def pull_trials():
            page = None
            while True:
                params = {'query.cond': query_label,
                    'filter.overallStatus': 'RECRUITING|ACTIVE_NOT_RECRUITING|NOT_YET_RECRUITING', 'pageSize': 100}
                if page:
                    params['pageToken'] = page
                result = request(trials.BASE, params)
                for study in result.get('studies', []):
                    record = trials.parse(study)
                    # Existing parser reads conditions from statusModule; v2 stores them here.
                    record['conditions'] = study.get('protocolSection', {}).get('conditionsModule', {}).get('conditions', [])
                    if record['nct_id'] and record['nct_id'] not in seen_trials:
                        record['query_disease'] = query_label
                        seen_trials.add(record['nct_id']); new_trials.append(record)
                page = result.get('nextPageToken')
                if not page:
                    break
        attempt('ClinicalTrials ' + query_label, pull_trials)
        print(query_label, 'trials complete', flush=True)
    append_field('data/raw/clinicaltrials.json', 'trials', new_trials, 'n_trials')
    report['added']['clinicaltrials'] = len(new_trials)
    # Source designs retain protocol/eligibility details in a new sidecar, including
    # completed registries excluded by the active-trial query.
    designs = {}
    for nct in ['NCT00144794', 'NCT03292887']:
        data = attempt('Registry protocol ' + nct, lambda: request(trials.BASE + '/' + nct))
        if data:
            designs[nct] = {'source': trials.BASE + '/' + nct, 'retrieved': DATE, 'study': data}
    if designs:
        sidecar = ROOT / 'data/raw/mps_registry_protocols.json'
        if sidecar.exists():
            raise RuntimeError('Refusing to overwrite existing registry sidecar')
        sidecar.write_text(json.dumps(designs, indent=1) + '\n')
    # Product 6 is a gene/disease association product, not a foundation directory.
    xml = ET.parse(ROOT / 'data/raw/orphanet_en_product6.xml')
    org_matches = [e.text for e in xml.iter() if e.text and any(s in e.text.lower()
        for s in ['sanfilippo foundation', 'mps society', 'cure sanfilippo', 'mps foundation'])]
    report['orphanet_org_matches'] = org_matches
    report['patient_org_matches'] = [o for o in read('data/raw/patient_orgs.json')['orgs']
        if any(s in json.dumps(o).lower() for s in ['sanfilippo', 'mps'])]
    write_processed('data/processed/mps_expansion_report.json', report)
    print(json.dumps({k: v for k, v in report.items() if k not in ['queries', 'slice_diseases', 'patient_org_matches']}, indent=1), flush=True)


if __name__ == '__main__':
    main()
