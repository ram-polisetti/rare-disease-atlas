# Graph JSON contract — `data/graph.json`

The single interface between the graph builder and the Streamlit UI. UI reads this file only.

```json
{
  "meta": {
    "built_at": "2026-10-03T...",
    "slice": "lysosomal storage diseases",
    "sources": [{"name": "HPO", "url": "...", "retrieved": "2026-10-03"}]
  },
  "nodes": [
    {
      "id": "MONDO:00010769",
      "type": "disease | gene | variant | phenotype | paper | trial | patient_org | researcher | mechanism | asset",
      "label": "Gaucher disease",
      "synonyms": ["glucocerebrosidase deficiency"],
      "description": "one-two sentence plain-language description",
      "cluster_id": 0,
      "extra": {"url": "...", "nct": "...", "pmid": "..."}
    }
  ],
  "edges": [
    {
      "source": "node-id",
      "target": "node-id",
      "relation": "caused_by_variant_in | has_phenotype | shares_pathway | studied_in | funded_by | advocated_by | extracted_claim | reuses_asset | ...",
      "evidence": "observed | inferred",
      "confidence": "high | medium | low",
      "source_db": "MONDO | HPO | ClinVar | Monarch | PubMed | ClinicalTrials | Orphanet | NORD | manual",
      "source_ref": "PMID:12345678 | https://... | NCT...",
      "date": "2026-10-03",
      "note": "one-line plain-language explanation of the link",
      "contradicts": false
    }
  ],
  "clusters": [
    {
      "id": 0,
      "label": "Lysosomal enzyme deficiencies with ERT precedent",
      "summary": "what connects these nodes, in plain language",
      "members": ["node-id", "..."],
      "shared_mechanism": "...",
      "reusable_assets": ["ICGG Gaucher Registry", "ERT trial designs (Gaucher/Fabry/Pompe)"],
      "gaps": ["what evidence is missing"],
      "next_experiment": "concrete next step"
    }
  ],
  "journeys": {
    "maria": {
      "start": "node-id (Gaucher disease)",
      "steps": [
        {"node": "node-id", "why": "why this step matters to Maria", "edge_note": "the edge that supports it, with source"}
      ],
      "ten_x_case": "siloed timeline vs shared-registry timeline",
      "assumptions": ["explicit assumption 1", "..."]
    }
  },
  "synonyms": {"gaucher disease": "MONDO:00010769", "gba": "HGNC:4177"}
}
```

Rules:
- Node ids: stable ontology ids where they exist (MONDO:, HP:, HGNC:, ClinVar variation ids, PMID:, NCT). Mint `atlas:` ids only for patient_org/researcher/asset nodes.
- Gene nodes use HGNC ids/symbols (GBA, GLA, GAA, SMPD1, NPC1, NPC2, HEXA, HEXB, IDUA, GALC, ARSA).
- Every edge MUST carry source_db, source_ref, date, confidence, evidence. No exceptions.
- `contradicts: true` edges must exist where the literature disagrees — do not hide them.
- The `synonyms` map must cover all slice diseases, genes, and common symptom names for the global search box.
