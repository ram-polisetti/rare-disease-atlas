#!/usr/bin/env python3
"""Phase 1+3: build curated graph nodes/edges, run Louvain, clusters, Maria's journey.
Writes data/graph.json. Use ~/workspace/.venv/bin/python.
Phase 2 merge (LLM edges) lives in merge_llm_edges.py which re-runs analyze().
"""
import json, re, sys, os
from datetime import datetime, timezone
from collections import Counter, defaultdict
import mps_slice

BASE = os.path.expanduser("~/workspace/hack-nation-rare-disease-atlas")
DATA = os.path.join(BASE, "data")
DATE = "2026-10-03"

nodes = {}
edges = []
_seen_edge = set()

def add_node(nid, ntype, label, synonyms=None, description="", extra=None):
    nodes[nid] = {
        "id": nid, "type": ntype, "label": label,
        "synonyms": synonyms or [], "description": description,
        "cluster_id": None, "extra": extra or {},
    }

def add_edge(source, target, relation, evidence, confidence, source_db,
             source_ref, note, contradicts=False):
    key = (source, target, relation, source_db)
    if key in _seen_edge:
        return
    _seen_edge.add(key)
    edges.append({
        "source": source, "target": target, "relation": relation,
        "evidence": evidence, "confidence": confidence,
        "source_db": source_db, "source_ref": source_ref,
        "date": DATE, "note": note, "contradicts": contradicts,
    })

def load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)

mondo = load("processed/mondo_slice_diseases.json")
hpo = load("processed/hpo_slice_phenotypes.json")
clinvar = load("processed/clinvar_slice_variants.json")
orphanet = load("processed/orphanet_slice_gene_disease.json")
monarch = load("raw/monarch_gene_disease_associations.json")
trials = load("raw/clinicaltrials.json")
orgs = load("raw/patient_orgs.json")


# ---------- mechanism constants (module level: used by build and analysis) ----------
MECHS = {
    "atlas:mech-lysosomal-enzyme-deficiency": ("Lysosomal enzyme deficiency",
        "The shared root defect: lysosomal enzymes or transporters fail, so undegraded "
        "substrate accumulates inside cells."),
    "atlas:mech-sphingolipid-catabolism": ("Sphingolipid catabolism",
        "Breakdown of sphingolipids (glucosylceramide, Gb3, sphingomyelin, galactosylceramide, "
        "sulfatide) inside the lysosome."),
    "atlas:mech-ganglioside-catabolism": ("GM2 ganglioside catabolism",
        "Breakdown of GM2 ganglioside by hexosaminidase A/B; failure drives Tay-Sachs and Sandhoff disease."),
    "atlas:mech-glycogen-metabolism": ("Glycogen metabolism",
        "Lysosomal breakdown of glycogen by acid alpha-glucosidase; failure drives Pompe disease."),
    "atlas:mech-glycosaminoglycan-catabolism": ("Glycosaminoglycan catabolism",
        "Lysosomal breakdown of glycosaminoglycans (GAGs), including dermatan and heparan sulfate. IDUA/IDS defects cause MPS I/II; SGSH, NAGLU, HGSNAT and GNS defects impair heparan-sulfate degradation in MPS III A–D."),
    "atlas:mech-lysosomal-lipid-trafficking": ("Lysosomal lipid and cholesterol trafficking",
        "Export of cholesterol and lipids out of the lysosome via NPC1/NPC2; failure drives Niemann-Pick type C."),
    "atlas:mech-lysosomal-neurodegeneration": ("Lysosomal dysfunction in neurodegeneration",
        "Impaired lysosomal function as a driver of neurodegeneration; the GBA1-Parkinson/Lewy body link."),
}
for mid2, (label, desc) in MECHS.items():
    add_node(mid2, "mechanism", label, synonyms=[], description=desc)
ROOT = "atlas:mech-lysosomal-enzyme-deficiency"
for m2 in MECHS:
    if m2 == ROOT:
        continue
    add_edge(m2, ROOT, "part_of", "inferred", "medium", "manual",
             "Orphanet/Monarch gene annotations",
             f"{MECHS[m2][0]} is a branch of the broader lysosomal dysfunction pathway.")

GENE_MECH = {
    "GBA":   ["atlas:mech-sphingolipid-catabolism", "atlas:mech-lysosomal-neurodegeneration"],
    "GLA":   ["atlas:mech-sphingolipid-catabolism"],
    "GAA":   ["atlas:mech-glycogen-metabolism"],
    "SMPD1": ["atlas:mech-sphingolipid-catabolism"],
    "NPC1":  ["atlas:mech-lysosomal-lipid-trafficking"],
    "NPC2":  ["atlas:mech-lysosomal-lipid-trafficking"],
    "HEXA":  ["atlas:mech-ganglioside-catabolism"],
    "HEXB":  ["atlas:mech-ganglioside-catabolism"],
    "IDUA":  ["atlas:mech-glycosaminoglycan-catabolism"],
    "GALC":  ["atlas:mech-sphingolipid-catabolism"],
    "ARSA":  ["atlas:mech-sphingolipid-catabolism"],
    "IDS":   ["atlas:mech-glycosaminoglycan-catabolism"],
    "SGSH":  ["atlas:mech-glycosaminoglycan-catabolism"],
    "NAGLU": ["atlas:mech-glycosaminoglycan-catabolism"],
    "HGSNAT": ["atlas:mech-glycosaminoglycan-catabolism"],
    "GNS":   ["atlas:mech-glycosaminoglycan-catabolism"],
}

def build_curated():
    # ---------- genes ----------
    GENES = {
        "GBA":   dict(hgnc="HGNC:4177",  gene_name="glucosylceramidase beta 1",
                      enzyme="glucocerebrosidase (acid beta-glucosidase)",
                      desc="Encodes acid beta-glucosidase (glucocerebrosidase), the lysosomal enzyme that breaks down glucosylceramide. Deficiency causes Gaucher disease."),
        "GLA":   dict(hgnc="HGNC:4296",  gene_name="galactosidase alpha",
                      enzyme="alpha-galactosidase A",
                      desc="Encodes alpha-galactosidase A, the lysosomal enzyme that clears globotriaosylceramide (Gb3). Deficiency causes Fabry disease."),
        "GAA":   dict(hgnc="HGNC:4065",  gene_name="glucosidase alpha, acid",
                      enzyme="acid alpha-glucosidase (acid maltase)",
                      desc="Encodes acid alpha-glucosidase, the lysosomal enzyme that breaks down glycogen. Deficiency causes Pompe disease (glycogen storage disease type II)."),
        "SMPD1": dict(hgnc="HGNC:11120", gene_name="sphingomyelin phosphodiesterase 1",
                      enzyme="acid sphingomyelinase",
                      desc="Encodes acid sphingomyelinase, the lysosomal enzyme that breaks down sphingomyelin. Deficiency causes Niemann-Pick disease types A and B."),
        "NPC1":  dict(hgnc="HGNC:7897",  gene_name="NPC intracellular cholesterol transporter 1",
                      enzyme="lysosomal cholesterol transporter NPC1",
                      desc="Encodes NPC1, the lysosomal membrane protein that exports cholesterol out of the lysosome. Mutations cause Niemann-Pick disease type C1."),
        "NPC2":  dict(hgnc="HGNC:14537", gene_name="NPC intracellular cholesterol transporter 2",
                      enzyme="lysosomal cholesterol transporter NPC2",
                      desc="Encodes NPC2, the small lysosomal protein that hands cholesterol to NPC1 for export. Mutations cause Niemann-Pick disease type C2."),
        "HEXA":  dict(hgnc="HGNC:4878",  gene_name="hexosaminidase subunit alpha",
                      enzyme="hexosaminidase A (alpha subunit)",
                      desc="Encodes the alpha subunit of hexosaminidase A, which breaks down GM2 ganglioside. Deficiency causes Tay-Sachs disease."),
        "HEXB":  dict(hgnc="HGNC:4879",  gene_name="hexosaminidase subunit beta",
                      enzyme="hexosaminidase beta subunit",
                      desc="Encodes the beta subunit shared by hexosaminidases A and B, which break down GM2 ganglioside. Deficiency causes Sandhoff disease."),
        "IDUA":  dict(hgnc="HGNC:5391",  gene_name="alpha-L-iduronidase",
                      enzyme="alpha-L-iduronidase",
                      desc="Encodes alpha-L-iduronidase, the lysosomal enzyme that breaks down glycosaminoglycans (dermatan sulfate, heparan sulfate). Deficiency causes mucopolysaccharidosis type I."),
        "GALC":  dict(hgnc="HGNC:4115",  gene_name="galactosylceramidase",
                      enzyme="galactosylceramidase",
                      desc="Encodes galactosylceramidase, the lysosomal enzyme that breaks down galactosylceramide. Deficiency causes Krabbe disease."),
        "ARSA":  dict(hgnc="HGNC:713",   gene_name="arylsulfatase A",
                      enzyme="arylsulfatase A",
                      desc="Encodes arylsulfatase A, the lysosomal enzyme that breaks down sulfatides. Deficiency causes metachromatic leukodystrophy."),
    }
    # IDs resolved by the expansion pipeline; full names from the local Orphanet release.
    for sym in ("IDS", "SGSH", "NAGLU", "HGSNAT", "GNS"):
        gene_name = next(link["gene_name"] for link in orphanet["links"] if link["gene_symbol"] == sym)
        GENES[sym] = dict(hgnc=monarch["genes"][sym]["id"], gene_name=gene_name,
                         enzyme=gene_name,
                         desc=f"Encodes {gene_name}, an enzyme involved in lysosomal glycosaminoglycan/heparan-sulfate degradation. Deficiency causes MPS II (IDS) or the corresponding Sanfilippo subtype (SGSH/NAGLU/HGSNAT/GNS).")
    HGNC_OF = {sym: g["hgnc"] for sym, g in GENES.items()}

    for sym, g in GENES.items():
        syns = [g["gene_name"]]
        if sym == "GBA":
            syns.append("GBA1")
        add_node(g["hgnc"], "gene", sym, synonyms=syns, description=g["desc"],
                 extra={"gene_name": g["gene_name"], "enzyme": g["enzyme"]})

    # ---------- diseases ----------
    disease_genes = defaultdict(list)   # mondo_id -> [(hgnc, sym, rel_note)]
    MONDO_API = "https://api-v3.monarchinitiative.org/v3/api/"
    for a in monarch["associations"]:
        hgnc = a["subject"]; mid = a["object"]
        sym = next((s for s, g in GENES.items() if g["hgnc"] == hgnc), None)
        if sym is None:
            continue
        disease_genes[mid].append((hgnc, sym, a["predicate"], a["primary_knowledge_source"]))

    orphanet_to_mondo = {}
    for d in mondo["diseases"]:
        for x in d.get("xrefs", []):
            if x.startswith("Orphanet:"):
                orphanet_to_mondo[x.split(":")[1]] = d["mondo_id"]

    for link in orphanet["links"]:
        onum = link["orphanet_id"].split(":")[1]
        sym = "GBA" if link["gene_symbol"] == "GBA1" else link["gene_symbol"]
        if sym not in HGNC_OF:
            continue
        hgnc = HGNC_OF[sym]
        mid = orphanet_to_mondo.get(onum)
        if mid is None and onum == "411602":
            mid = "ORPHA:411602"  # off-slice: keep per naming note
        if mid is None:
            continue
        atype = link["association_type"]
        pred = "susceptibility" if "susceptibility" in atype.lower() else "causal"
        if not any(g[0] == hgnc for g in disease_genes[mid]):
            disease_genes[mid].append((hgnc, sym, pred, "infores:orphanet"))

    SUBTYPE_NOTES = [
        ("perinatal", "The perinatal-lethal form: symptoms begin before or around birth."),
        ("type I", "The non-neuronopathic form, the most common type."),
        ("type II", "The acute neuronopathic form."),
        ("type III", "The chronic neuronopathic form."),
        ("infantile onset", "The infantile-onset form."),
        ("infantile form", "The infantile form."),
        ("late infantile", "The late-infantile form."),
        ("juvenile form", "The juvenile form."),
        ("adult form", "The adult form."),
        ("adult neurologic onset", "The adult neurologic-onset form."),
        ("late-onset", "The late-onset form."),
        ("severe perinatal", "The severe perinatal form."),
        ("severe early infantile", "The severe early-infantile neurologic form."),
    ]

    def disease_description(label, genes):
        if "Parkinson" in label:
            return ("Neurodegenerative movement disorder. GBA1 variants are a major genetic risk "
                    "factor (susceptibility), not a causal gene.")
        if "Lewy body dementia" in label:
            return ("Dementia with parkinsonism. GBA1 carrier status increases risk.")
        base = "A rare lysosomal storage disease"
        if genes:
            enz = "; ".join(sorted({GENES[s]["enzyme"] for _, s, _, _ in genes}))
            syms = ", ".join(sorted({s for _, s, _, _ in genes}))
            base += f" caused by deficient activity of {enz} (gene {syms})."
        else:
            base += "."
        for kw, note in SUBTYPE_NOTES:
            if kw in label.lower():
                base += " " + note
                break
        return base

    mondo_ids = [d["mondo_id"] for d in mondo["diseases"]]
    for d in mondo["diseases"]:
        mid = d["mondo_id"]
        genes = disease_genes.get(mid, [])
        add_node(mid, "disease", d["label"], synonyms=d.get("synonyms", []),
                 description=d.get("definition") or disease_description(d["label"], genes),
                 extra={"xrefs": d.get("xrefs", []), "source": d.get("source"),
                        "retrieved": d.get("retrieved")})

    add_node("ORPHA:411602", "disease", "Hereditary late-onset Parkinson disease",
             synonyms=["hereditary late-onset Parkinson disease"],
             description=("Hereditary late-onset Parkinson disease. GBA1 is a major susceptibility "
                          "factor (Orphanet) - a risk modifier, not a causal gene."),
             extra={"orphanet_id": "ORPHA:411602", "off_slice": True})

    # ---------- disease-gene edges ----------
    PRED_REL = {
        "biolink:causes": "caused_by_variant_in",
        "biolink:gene_associated_with_condition": "associated_with_gene",
        "biolink:contributes_to": "susceptibility_factor_for",
        "causal": "caused_by_variant_in",
        "susceptibility": "susceptibility_factor_for",
    }
    for mid, glist in disease_genes.items():
        for hgnc, sym, pred, pk in glist:
            rel = PRED_REL.get(pred, "associated_with_gene")
            conf = "medium" if rel == "susceptibility_factor_for" else "high"
            if pk == "infores:orphanet":
                srcdb, srcref = "Orphanet", "https://www.orphadata.com/ (en_product6, 2026-06-23)"
                note = (f"Orphanet lists {sym} as '{'a major susceptibility factor in' if rel=='susceptibility_factor_for' else 'disease-causing in'}' this disease."
                        if rel == "susceptibility_factor_for"
                        else f"Orphanet lists disease-causing germline mutations of {sym} in this disease.")
            else:
                srcdb, srcref = "Monarch", MONDO_API
                note = (f"Monarch/OMIM records {sym} as contributing to (risk modifier for) this disease."
                        if rel == "susceptibility_factor_for"
                        else f"Curated gene-disease link: variants in {sym} cause this disease (Monarch/OMIM).")
            add_edge(mid, hgnc, rel, "observed", conf, srcdb, srcref, note)

    # ---------- contradicts: disputed causal claim for GBA1->Parkinson ----------
    add_edge("HGNC:4177", "MONDO:0008199", "causal_for", "inferred", "low",
             "manual", "https://omim.org/entry/606463",
             ("DISPUTED: some broad association summaries frame GBA1 as a Parkinson causal gene; "
              "curated DBs (OMIM: contributes_to; Orphanet: major susceptibility factor) classify it "
              "as a risk modifier only. Edge records the disputed claim, not the consensus."),
             contradicts=True)
    add_edge("HGNC:4177", "MONDO:0007488", "causal_for", "inferred", "low",
             "manual", "https://omim.org/entry/606463",
             ("DISPUTED: GBA1 is sometimes listed as a Lewy body dementia causal gene; OMIM records "
              "it as contributes_to (risk modifier). Edge records the disputed claim."),
             contradicts=True)

    # ---------- phenotypes ----------
    for d in hpo["diseases"]:
        for p in d["phenotypes"]:
            pid = p["hp_id"]
            if pid not in nodes:
                add_node(pid, "phenotype", p["hp_label"], synonyms=[],
                         description="Clinical feature from the Human Phenotype Ontology.",
                         extra={"hp_id": pid})

    pheno_disease_count = Counter()
    for d in hpo["diseases"]:
        mid = d["mondo_id"]
        for p in d["phenotypes"]:
            pheno_disease_count[p["hp_id"]] += 1
            add_edge(mid, p["hp_id"], "has_phenotype", "observed", "high", "HPO",
                     p.get("reference") or "HPO phenotype.hpoa",
                     f"Annotated in HPO as a clinical feature of {d['disease_label']}.")
    for pid, n in pheno_disease_count.items():
        nodes[pid]["description"] = (f"Clinical feature from the Human Phenotype Ontology, "
                                     f"annotated in {n} slice disease(s).")

    # ---------- variants ----------
    for sym, varlist in clinvar["genes"].items():
        hgnc = HGNC_OF[sym]
        for v in varlist:
            vid = f"ClinVar:{v['clinvar_id']}"
            m = re.search(r"\(p\.([A-Za-z0-9*]+)\)", v["title"] or "")
            plabel = f"p.{m.group(1)}" if m else v["clinvar_id"]
            add_node(vid, "variant", f"{sym} {plabel}", synonyms=[v.get("accession", "")],
                     description=f"ClinVar variant {v.get('accession','')}: {v.get('title','')}",
                     extra={"clinvar_id": v["clinvar_id"], "accession": v.get("accession"),
                            "hgvs": v.get("hgvs")})
            add_edge(vid, hgnc, "variant_of", "observed", "high", "ClinVar",
                     f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{v['clinvar_id']}/",
                     f"Pathogenic/likely-pathogenic variant in {sym} (ClinVar).")

    # ---------- mechanisms ----------
    for sym, mlist in GENE_MECH.items():
        hgnc = HGNC_OF[sym]
        for m2 in mlist:
            inferred = sym in ("IDS", "SGSH", "NAGLU", "HGSNAT", "GNS")
            conf = "medium" if inferred or m2 == "atlas:mech-lysosomal-neurodegeneration" else "high"
            add_edge(hgnc, m2, "disrupts_pathway", "inferred" if inferred else "observed", conf, "manual",
                     "Orphanet/Monarch gene annotations",
                     f"Loss of {sym} function disrupts {MECHS[m2][0].lower()}.")

    # disease -> mechanism (through its causal gene; primary = first listed pathway)
    disease_mech = {}
    for mid, glist in disease_genes.items():
        mechs = []
        for hgnc, sym, pred, pk in glist:
            for m2 in GENE_MECH.get(sym, []):
                if m2 not in mechs:
                    mechs.append(m2)
        label = nodes[mid]["label"]
        if ("Parkinson" in label or "Lewy body" in label) and \
                "atlas:mech-lysosomal-neurodegeneration" in mechs:
            # GBA-linked neurodegeneration is the relevant frame for Parkinson/LBD
            mechs.remove("atlas:mech-lysosomal-neurodegeneration")
            mechs.insert(0, "atlas:mech-lysosomal-neurodegeneration")
        if mechs:
            primary = mechs[0]
            disease_mech[mid] = mechs
            for m2 in mechs:
                add_edge(mid, m2, "has_mechanism", "inferred", "medium", "manual",
                         "Orphanet/Monarch gene annotations",
                         f"{nodes[mid]['label']} disrupts {MECHS[m2][0].lower()} via its causal gene.")

    # disease-disease shares_pathway (same primary mechanism)
    mech_diseases = defaultdict(list)
    for mid, mechs in disease_mech.items():
        mech_diseases[mechs[0]].append(mid)
    for m2, mids in mech_diseases.items():
        mids = sorted(mids)
        for i in range(len(mids)):
            for j in range(i + 1, len(mids)):
                a, b = mids[i], mids[j]
                add_edge(a, b, "shares_pathway", "inferred", "medium", "manual",
                         "Orphanet/Monarch gene annotations",
                         f"Mechanistic neighbors: both disrupt {MECHS[m2][0].lower()}, so therapeutic "
                         f"precedent (e.g. enzyme replacement) may transfer between them.")
    print(f"[build] nodes={len(nodes)} edges={len(edges)} (curated core)", flush=True)

    # ---------- trials ----------
    QD_MAP = {
        "Gaucher disease": ["MONDO:0011945", "MONDO:0009265", "MONDO:0009266", "MONDO:0009267", "MONDO:0009268"],
        "Fabry disease": ["MONDO:0010526"],
        "Pompe disease": ["MONDO:0017694", "MONDO:0018485", "MONDO:0009290"],
        "Niemann-Pick disease": ["MONDO:0009756", "MONDO:0011871", "MONDO:0009757", "MONDO:0016306",
                                 "MONDO:0016307", "MONDO:0016308", "MONDO:0016310", "MONDO:0016309",
                                 "MONDO:0011873"],
        "Mucopolysaccharidosis type I": ["MONDO:0001586", "MONDO:0011758", "MONDO:0011759", "MONDO:0011760"],
        "Tay-Sachs disease": ["MONDO:0010100", "MONDO:0017724", "MONDO:0017726", "MONDO:0017725"],
        "Metachromatic leukodystrophy": ["MONDO:0009591", "MONDO:0017730", "MONDO:0017729"],
        "Krabbe disease": ["MONDO:0009499", "MONDO:0016089", "MONDO:0016090", "MONDO:0016091"],
        "Sandhoff disease": ["MONDO:0010006", "MONDO:0017722", "MONDO:0017723", "MONDO:0017721"],
    }
    trial_disease = defaultdict(list)
    QD_MAP.update(mps_slice.disease_map(mondo))
    for t in trials["trials"]:
        nid = t["nct_id"]
        phases = ", ".join(t.get("phase", []) or ["N/A"])
        add_node(nid, "trial", t["title"][:120], synonyms=[],
                 description=(f"{t['status']} {phases} trial led by {t.get('lead_sponsor','?')}, "
                              f"started {t.get('start_date','?')}. {t['title']}"),
                 extra={"nct": nid, "url": t.get("url"), "status": t["status"],
                        "phase": t.get("phase", []), "sponsor": t.get("lead_sponsor")})
        for mid in QD_MAP.get(t.get("query_disease"), []):
            trial_disease[nid].append(mid)
            add_edge(nid, mid, "studied_in", "observed", "medium", "ClinicalTrials",
                     t.get("url") or f"https://clinicaltrials.gov/study/{nid}/",
                     f"Trial queried under '{t.get('query_disease')}' on ClinicalTrials.gov; "
                     f"title-mapped to {nodes[mid]['label']}.")

    # ---------- patient orgs + assets ----------
    def slug(s):
        return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

    ORG_DISEASE_MAP = {
        "Gaucher disease": ["MONDO:0011945", "MONDO:0009265", "MONDO:0009266", "MONDO:0009267", "MONDO:0009268"],
        "Fabry disease": ["MONDO:0010526"],
        "Tay-Sachs disease": ["MONDO:0010100", "MONDO:0017724", "MONDO:0017726", "MONDO:0017725"],
        "Sandhoff disease": ["MONDO:0010006", "MONDO:0017722", "MONDO:0017723", "MONDO:0017721"],
        "Niemann-Pick disease A/B": ["MONDO:0009756", "MONDO:0011871"],
        "Niemann-Pick disease C": ["MONDO:0009757", "MONDO:0016306", "MONDO:0016307",
                                   "MONDO:0016308", "MONDO:0016310", "MONDO:0016309", "MONDO:0011873"],
        "Pompe disease": ["MONDO:0017694", "MONDO:0018485", "MONDO:0009290"],
        "Mucopolysaccharidosis type I": ["MONDO:0001586", "MONDO:0011758", "MONDO:0011759", "MONDO:0011760"],
        "Krabbe disease": ["MONDO:0009499", "MONDO:0016089", "MONDO:0016090", "MONDO:0016091"],
        "Metachromatic leukodystrophy": ["MONDO:0009591", "MONDO:0017730", "MONDO:0017729"],
    }

    ASSETS = {
        "atlas:asset-icgg": ("ICGG Gaucher Registry",
            "Long-running international Gaucher registry (now in Sanofi Rare Disease Registries); "
            "thousands of patient-years of natural-history and treatment data.",
            ["MONDO:0011945", "MONDO:0009265", "MONDO:0009266", "MONDO:0009267", "MONDO:0009268"]),
        "atlas:asset-fabry-registry": ("Fabry Registry",
            "Sanofi-run international Fabry disease registry; longitudinal natural-history and ERT outcome data.",
            ["MONDO:0010526"]),
        "atlas:asset-pompe-registry": ("Pompe Registry",
            "Sanofi-run international Pompe disease registry; longitudinal data on infantile and late-onset forms.",
            ["MONDO:0017694", "MONDO:0018485", "MONDO:0009290"]),
        "atlas:asset-inpdr": ("International Niemann-Pick Disease Registry (INPDR)",
            "International patient registry for Niemann-Pick disease type C; natural-history data for NPC1/NPC2.",
            ["MONDO:0009757", "MONDO:0016306", "MONDO:0016307", "MONDO:0016308",
             "MONDO:0016310", "MONDO:0016309", "MONDO:0011873"]),
        "atlas:asset-iamrare": ("NORD IAMRARE registry platform",
            "NORD's registry platform for rare-disease natural-history studies; reusable infrastructure.",
            mondo_ids),
        "atlas:asset-ert-trial-designs": ("Shared ERT trial designs (Gaucher/Fabry/Pompe)",
            "Enzyme replacement therapy trial designs proven in Gaucher, Fabry, and Pompe: reusable "
            "endpoints, dosing paradigms, and safety monitoring for other lysosomal diseases.",
            ["MONDO:0009265", "MONDO:0009266", "MONDO:0009267", "MONDO:0010526",
             "MONDO:0017694", "MONDO:0018485", "MONDO:0009290"]),
        "atlas:asset-cross-disease-proposal": ("Proposal: cross-disease natural-history study",
            "Sourced proposal: a single natural-history study spanning mechanistically linked lysosomal "
            "diseases, reusing ICGG registry infrastructure and shared ERT trial-design endpoints.",
            []),
    }
    ORG_DISEASE_MAP.update(mps_slice.disease_map(mondo))
    for aid, (label, desc, mids) in ASSETS.items():
        add_node(aid, "asset", label, synonyms=[], description=desc, extra={"stage": "proposal" if "proposal" in aid else "operational"})
        for mid in mids:
            add_edge(mid, aid, "reuses_asset", "inferred", "medium", "manual",
                     "Hand-curated patient orgs (URLs verified 2026-10-03)",
                     f"{nodes[mid]['label']} can reuse '{label}' for natural-history data and trial design.")

    for o in orgs["orgs"]:
        oid = "atlas:org-" + slug(o["name"])
        mids = []
        for dn in o["diseases"]:
            if "All lysosomal storage" in dn:
                mids += mondo_ids
            else:
                mids += ORG_DISEASE_MAP.get(dn, [])
        if o["name"] == "National MPS Society":
            mids += [d["mondo_id"] for d in mondo["diseases"]
                     if d["label"].startswith(("mucopolysaccharidosis type 2", "mucopolysaccharidosis type 3"))]
        add_node(oid, "patient_org", o["name"], synonyms=[],
                 description="; ".join(o.get("assets", [])) or "Patient advocacy organization.",
                 extra={"url": o["url"], "assets": o.get("assets", [])})
        for mid in sorted(set(mids)):
            add_edge(mid, oid, "advocated_by", "observed", "high", "manual", o["url"],
                     f"{o['name']} is the patient organization covering {nodes[mid]['label']}.")
        for asset_text in o.get("assets", []):
            low = asset_text.lower()
            for aid, (alabel, _, amids) in ASSETS.items():
                key = alabel.lower().split(" (")[0]
                if key in low and any(m in mids for m in amids):
                    add_edge(oid, aid, "maintains_asset", "observed", "high", "manual", o["url"],
                             f"{o['name']} is associated with '{alabel}'.")

    # proposal links for Maria's journey
    mps_slice.add_assets(add_node, add_edge, nodes, DATA)

    # ---------- researchers (from PubMed authors of slice papers) ----------
    ENTITY_NODE = {
        "GBA": "HGNC:4177", "GLA": "HGNC:4296", "GAA": "HGNC:4065", "SMPD1": "HGNC:11120",
        "NPC1": "HGNC:7897", "NPC2": "HGNC:14537", "GALC": "HGNC:4115", "ARSA": "HGNC:713",
        "Pompe disease": "MONDO:0009290", "Niemann-Pick disease type A/B": "MONDO:0009756",
        "Fabry disease": "MONDO:0010526", "Niemann-Pick disease type C": "MONDO:0009757",
        "Sandhoff disease": "MONDO:0010006", "Krabbe disease": "MONDO:0009499",
        "Metachromatic leukodystrophy": "MONDO:0017729", "Tay-Sachs disease": "MONDO:0010100",
        "Mucopolysaccharidosis type I": "MONDO:0001586",
    }
    by_entity = defaultdict(list)
    ENTITY_NODE.update({g: monarch["genes"][g]["id"] for g in ("IDS", "SGSH", "NAGLU", "HGSNAT", "GNS")})
    ENTITY_NODE.update({"mucopolysaccharidosis type III": "MONDO:0018937",
                        "Sanfilippo syndrome": "MONDO:0018937", "Hunter syndrome": "MONDO:0010674",
                        "mucopolysaccharidosis type II": "MONDO:0010674"})
    for line in open(os.path.join(DATA, "raw/pubmed_abstracts.jsonl")):
        a = json.loads(line)
        by_entity[a["query_entity"]].append(a)

    res_n = 0
    for ent, papers in sorted(by_entity.items()):
        target = ENTITY_NODE.get(ent)
        if target is None or target not in nodes:
            continue
        first_authors = Counter()
        paper_of = {}
        for p in papers:
            auths = p.get("authors") or []
            if auths:
                fa = auths[0]
                first_authors[fa] += 1
                paper_of.setdefault(fa, p)
        for fa, _ in first_authors.most_common(2):
            p = paper_of[fa]
            rid = f"atlas:res-{slug(fa)}-{res_n}"
            res_n += 1
            add_node(rid, "researcher", fa, synonyms=[],
                     description=f"First author on slice literature for {ent} (see PMID).",
                     extra={"pmid": p["pmid"]})
            add_edge(rid, target, "authored_study_on", "observed", "medium", "PubMed",
                     f"PMID:{p['pmid']}",
                     f"First author on '{p['title'][:80]}' ({p.get('journal','?')}).")
    print(f"[build] after trials/orgs/researchers: nodes={len(nodes)} edges={len(edges)}", flush=True)
    json.dump({"nodes": nodes, "edges": edges},
              open(os.path.join(DATA, "_curated_intermediate.json"), "w"))

    return nodes, edges, disease_mech


def analyze(nodes, edges, disease_mech, llm_merged=False):
    # ================= ANALYSIS =================
    import networkx as nx
    from community import community_louvain

    SUB_TYPES = {"disease", "gene", "phenotype"}
    G = nx.Graph()
    for nid, n in nodes.items():
        if n["type"] in SUB_TYPES:
            G.add_node(nid)

    pheno_sets = defaultdict(set)
    for e in edges:
        s, t = e["source"], e["target"]
        if e["relation"] == "has_phenotype" and s in G and t in G:
            pheno_sets[s].add(t)
            G.add_edge(s, t, weight=1.0)
        elif e["relation"] in ("caused_by_variant_in", "associated_with_gene",
                               "susceptibility_factor_for", "variant_of") and s in G and t in G:
            if G.has_edge(s, t):
                G[s][t]["weight"] = max(G[s][t]["weight"], 6.0)
            else:
                G.add_edge(s, t, weight=6.0)
        elif e["relation"] == "shares_pathway" and s in G and t in G:
            G.add_edge(s, t, weight=4.0)

    print(f"[louvain] subgraph nodes={G.number_of_nodes()} edges={G.number_of_edges()}", flush=True)
    part = community_louvain.best_partition(G, weight="weight", resolution=1.0, random_state=42)
    mod = community_louvain.modularity(part, G, weight="weight")
    print(f"[louvain] communities={len(set(part.values()))} modularity={mod:.4f}", flush=True)

    # cluster_id for subgraph nodes; propagate to the rest via primary linked disease
    for nid, cid in part.items():
        nodes[nid]["cluster_id"] = cid
    disease_of = {}
    for e in edges:
        s, t, r = e["source"], e["target"], e["relation"]
        if r == "studied_in" and t in part:            # trial -> disease
            disease_of[s] = t
        elif r == "advocated_by" and s in part:        # disease -> org
            disease_of.setdefault(t, s)
        elif r == "variant_of" and t in part:          # variant -> gene
            disease_of[s] = t
        elif r == "authored_study_on" and t in part:   # researcher -> target
            disease_of[s] = t
        elif r == "has_mechanism" and s in part:       # disease -> mechanism
            disease_of.setdefault(t, s)
        elif r == "reuses_asset" and s in part:        # disease -> asset
            disease_of.setdefault(t, s)
    # assets/orgs linked to several diseases: vote for the most common cluster
    asset_votes = defaultdict(list)
    for e in edges:
        s, t, r = e["source"], e["target"], e["relation"]
        if r in ("reuses_asset", "advocated_by", "maintains_asset") and s in part and t not in part:
            asset_votes[t].append(s)
        if r == "maintains_asset" and s in disease_of and t not in part:
            asset_votes[t].append(disease_of[s])
    for aid, voters in asset_votes.items():
        top = Counter(part[v] for v in voters).most_common(1)[0][0]
        for nid, n in nodes.items():
            if nid == aid:
                n["cluster_id"] = top
    for nid, n in nodes.items():
        if n["cluster_id"] is None:
            d = disease_of.get(nid)
            n["cluster_id"] = part.get(d, -1) if d else -1
    n_unassigned = sum(1 for n in nodes.values() if n["cluster_id"] == -1)
    print(f"[cluster] unassigned cluster_id (-1): {n_unassigned}", flush=True)
    # the shared root mechanism and the cross-disease proposal have no single disease home:
    mode_cid = Counter(part.values()).most_common(1)[0][0]
    nodes["atlas:mech-lysosomal-enzyme-deficiency"]["cluster_id"] = mode_cid  # umbrella, follows the majority cluster
    nodes["atlas:asset-cross-disease-proposal"]["cluster_id"] = nodes[mps_slice.ASSET]["cluster_id"]

    # ---------- cluster summaries ----------
    NEXT_EXPERIMENT = {
        "atlas:mech-sphingolipid-catabolism": (
            "Run one shared lysosomal biomarker panel (plasma lyso-sphingolipids incl. "
            "glucosylsphingosine, lyso-Gb3, psychosine) across Fabry + Gaucher + Krabbe cohorts "
            "drawn from the Fabry Registry and ICGG, to validate a single assay across three diseases."),
        "atlas:mech-ganglioside-catabolism": (
            "Pool GM2-ganglioside CSF/plasma readouts from Tay-Sachs and Sandhoff natural-history "
            "records (NTSAD network) into one cross-disease baseline so future gene-therapy trials "
            "share a control arm."),
        "atlas:mech-glycogen-metabolism": (
            "Pool the placebo arms of the 41 Pompe trials into a single natural-history model for "
            "acid maltase deficiency, then publish the shared baseline so no new trial re-recruits "
            "untreated controls."),
        "atlas:mech-glycosaminoglycan-catabolism": (
            "Cross-compare urinary GAG profiles from MPS I registry data against Sanfilippo cohorts "
            "to define a shared early-response endpoint for GAG-clearance therapies."),
        "atlas:mech-lysosomal-lipid-trafficking": (
            "Compare oxysterol biomarker trajectories in INPDR-registered NPC patients on miglustat "
            "vs off-treatment to define a registry-based surrogate endpoint for NPC trials."),
        "atlas:mech-lysosomal-neurodegeneration": (
            "Stratify a late-onset Parkinson natural-history cohort by GBA1 carrier status and test "
            "whether lysosomal readouts (glucosylsphingosine) predict conversion, borrowing the "
            "ICGG registry design."),
        "atlas:mech-lysosomal-enzyme-deficiency": (
            "Catalog ERT dosing and immunogenicity data across all registry-linked diseases to build "
            "a shared safety baseline for first-in-disease enzyme therapies."),
    }
    cluster_members = defaultdict(list)
    for nid, n in nodes.items():
        cluster_members[n["cluster_id"]].append(nid)

    clusters = []
    for cid in sorted(cluster_members):
        mids = cluster_members[cid]
        dis = [m for m in mids if nodes[m]["type"] == "disease"]
        mech_counts = Counter()
        for m in dis:
            for me in disease_mech.get(m, []):
                mech_counts[me] += 1
        top_mech = mech_counts.most_common(1)[0][0] if mech_counts else ROOT
        genes_in = sorted({nodes[e["target"]]["label"] for e in edges
                           if e["source"] in dis and e["relation"] in
                           ("caused_by_variant_in", "associated_with_gene", "susceptibility_factor_for")})
        labels = sorted(nodes[m]["label"] for m in dis)
        shared_mech = MECHS[top_mech][0]
        reusable = sorted({nodes[e["target"]]["label"] for e in edges
                           if e["source"] in dis and e["relation"] == "reuses_asset"
                           and e["target"].startswith("atlas:asset-")})
        trial_set = {e["source"] for e in edges if e["relation"] == "studied_in" and e["target"] in dis}
        gaps = []
        no_pheno = [nodes[m]["label"] for m in dis if not pheno_sets.get(m)]
        if no_pheno:
            gaps.append(f"No HPO phenotype annotations for: {', '.join(no_pheno[:5])}.")
        if not trial_set:
            gaps.append("No clinical trials mapped to any disease in this cluster.")
        no_registry = [nodes[m]["label"] for m in dis
                       if not any(e["source"] == m and e["relation"] == "reuses_asset"
                                  and "egistry" in nodes[e["target"]]["label"] for e in edges)]
        if no_registry:
            gaps.append(f"No dedicated registry asset for: {', '.join(no_registry[:5])}.")
        if not gaps:
            gaps.append("Cross-disease natural-history data still fragmented across single-disease registries.")
        clusters.append({
            "id": cid,
            "label": f"{shared_mech} ({', '.join(genes_in) if genes_in else 'no genes'})",
            "summary": (f"{len(dis)} disease(s) - {', '.join(labels[:8])}{'...' if len(labels) > 8 else ''} - "
                        f"connected through {shared_mech.lower()} and overlapping phenotypes; "
                        f"{len(trial_set)} trials and {len(reusable)} reusable asset(s)."),
            "members": sorted(mids),
            "shared_mechanism": shared_mech,
            "reusable_assets": reusable,
            "gaps": gaps,
            "next_experiment": NEXT_EXPERIMENT.get(top_mech, NEXT_EXPERIMENT[ROOT]),
        })

    # ---------- Maria's journey ----------
    journeys = mps_slice.journey()
    maria_steps = journeys["maria"]["steps"]

    # ---------- synonyms ----------
    synonyms = {}
    def syn(k, nid):
        k = k.strip().lower()
        if k and k not in synonyms:
            synonyms[k] = nid
    for nid, n in nodes.items():
        syn(n["label"], nid)
        for s in n.get("synonyms", []):
            syn(s, nid)
    COMMON_SYMPTOMS = {
        "enlarged liver": None, "enlarged spleen": None, "bone pain": None,
    }
    for pid, n in nodes.items():
        if n["type"] == "phenotype":
            lab = n["label"].lower()
            if lab == "hepatomegaly":
                syn("enlarged liver", pid)
            elif lab == "splenomegaly":
                syn("enlarged spleen", pid)
            elif "bone pain" in lab:
                syn("bone pain", pid)
    for alias, target in {
        "gaucher": "MONDO:0009265", "fabry": "MONDO:0010526", "pompe": "MONDO:0009290",
        "tay-sachs": "MONDO:0010100", "tay sachs": "MONDO:0010100",
        "sandhoff": "MONDO:0010006", "niemann-pick": "MONDO:0009756",
        "krabbe": "MONDO:0009499", "mld": "MONDO:0017729", "hurler": "MONDO:0011758",
        "parkinson": "MONDO:0008199", "gba": "HGNC:4177", "gba1": "HGNC:4177",
        "ids": "HGNC:5389",
        "hunter": "MONDO:0010674",
        "hunter syndrome": "MONDO:0010674",
        "mps ii": "MONDO:0010674",
        "mucopolysaccharidosis type ii": "MONDO:0010674",
        "sgsh": "HGNC:10818",
        "mps iiia": "MONDO:0009655",
        "sanfilippo a": "MONDO:0009655",
        "sanfilippo syndrome a": "MONDO:0009655",
        "sanfilippo syndrome type a": "MONDO:0009655",
        "mucopolysaccharidosis type iiia": "MONDO:0009655",
        "naglu": "HGNC:7632",
        "mps iiib": "MONDO:0009656",
        "sanfilippo b": "MONDO:0009656",
        "sanfilippo syndrome b": "MONDO:0009656",
        "sanfilippo syndrome type b": "MONDO:0009656",
        "mucopolysaccharidosis type iiib": "MONDO:0009656",
        "hgsnat": "HGNC:26527",
        "mps iiic": "MONDO:0009657",
        "sanfilippo c": "MONDO:0009657",
        "sanfilippo syndrome c": "MONDO:0009657",
        "sanfilippo syndrome type c": "MONDO:0009657",
        "mucopolysaccharidosis type iiic": "MONDO:0009657",
        "gns": "HGNC:4422",
        "mps iiid": "MONDO:0009658",
        "sanfilippo d": "MONDO:0009658",
        "sanfilippo syndrome d": "MONDO:0009658",
        "sanfilippo syndrome type d": "MONDO:0009658",
        "mucopolysaccharidosis type iiid": "MONDO:0009658",
        "sanfilippo syndrome": "MONDO:0018937",
        "mps iii": "MONDO:0018937",
    }.items():
        syn(alias, target)

    meta = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "slice": "lysosomal storage diseases",
        "llm_edges_merged": llm_merged,
        "louvain": {"communities": len(set(part.values())), "modularity": round(mod, 4),
                    "resolution": 1.0, "random_state": 42,
                    "note": "Louvain on disease-gene-phenotype subgraph; disease-disease edges "
                            "weighted by shared primary mechanism (4.0), disease-gene 6.0, "
                            "disease-phenotype 1.0."},
        "sources": [
            {"name": "MONDO/Monarch Biolink API v3", "url": "https://api-v3.monarchinitiative.org/v3/api/", "retrieved": "2026-10-03"},
            {"name": "HPO (phenotype.hpoa + hp.json)", "url": "https://hpo.jax.org/", "retrieved": "2026-10-03"},
            {"name": "ClinVar (NCBI E-utilities)", "url": "https://www.ncbi.nlm.nih.gov/clinvar/", "retrieved": "2026-10-03"},
            {"name": "Orphanet orphadata en_product6 (CC-BY 4.0, 2026-06-23)", "url": "https://www.orphadata.com/", "retrieved": "2026-10-03"},
            {"name": "ClinicalTrials.gov API v2", "url": "https://clinicaltrials.gov/", "retrieved": "2026-10-03"},
            {"name": "PubMed abstracts (expanded lysosomal slice papers)", "url": "https://pubmed.ncbi.nlm.nih.gov/", "retrieved": "2026-10-03"},
            {"name": "Patient orgs (hand-curated, URLs verified 2026-10-03)", "url": "", "retrieved": "2026-10-03"},
        ],
    }

    graph = {"meta": meta, "nodes": list(nodes.values()), "edges": edges,
             "clusters": clusters, "journeys": journeys, "synonyms": synonyms}
    OUT = os.path.join(DATA, "graph.json")

    # ---------- validation ----------
    errors = []
    REQ_EDGE = {"source", "target", "relation", "evidence", "confidence",
                "source_db", "source_ref", "date", "note", "contradicts"}
    REQ_NODE = {"id", "type", "label", "synonyms", "description", "cluster_id", "extra"}
    for i, e in enumerate(edges):
        miss = REQ_EDGE - set(e.keys())
        if miss:
            errors.append(f"edge {i} missing {miss}")
        if e.get("evidence") not in ("observed", "inferred"):
            errors.append(f"edge {i} bad evidence {e.get('evidence')}")
        if e.get("confidence") not in ("high", "medium", "low"):
            errors.append(f"edge {i} bad confidence {e.get('confidence')}")
        for k in ("source", "target"):
            if e[k] not in nodes:
                errors.append(f"edge {i} dangling {k}={e[k]}")
    for n in graph["nodes"]:
        miss = REQ_NODE - set(n.keys())
        if miss:
            errors.append(f"node {n.get('id')} missing {miss}")
    # spot checks
    def has_edge(s, t, rel):
        return any(e["source"] == s and e["target"] == t and e["relation"] == rel for e in edges)
    checks = [
        ("Gaucher->GBA", has_edge("MONDO:0009265", "HGNC:4177", "caused_by_variant_in")),
        ("GBA variants exist", any(e["source"].startswith("ClinVar:") and e["target"] == "HGNC:4177" for e in edges)),
        ("Gaucher phenotypes", any(e["source"] == "MONDO:0009265" and e["relation"] == "has_phenotype" for e in edges)),
        ("Gaucher->Fabry pathway", has_edge("MONDO:0009265", "MONDO:0010526", "shares_pathway") or
         has_edge("MONDO:0010526", "MONDO:0009265", "shares_pathway")),
        ("disease->org->registry",
         has_edge("MONDO:0009265", "atlas:org-national-gaucher-foundation", "advocated_by") and
         has_edge("atlas:org-national-gaucher-foundation", "atlas:asset-icgg", "maintains_asset")),
        ("contradicts edge", any(e.get("contradicts") for e in edges)),
        ("journey nodes exist", all(st["node"] in nodes for st in maria_steps)),
    ]
    for name, ok in checks:
        print(f"[check] {name}: {'OK' if ok else 'FAIL'}", flush=True)
        if not ok:
            errors.append(f"spot check failed: {name}")

    if errors:
        print(f"[VALIDATION FAILED] {len(errors)} errors", flush=True)
        for e in errors[:20]:
            print("  -", e, flush=True)
        sys.exit(1)

    with open(OUT, "w") as f:
        json.dump(graph, f, indent=1)
    print(f"[done] wrote {OUT}: nodes={len(nodes)} edges={len(edges)} "
          f"clusters={len(clusters)} synonyms={len(synonyms)}", flush=True)



if __name__ == "__main__":
    _llm = os.environ.get("GRAPH_LLM_MERGED") == "1"
    if os.environ.get("GRAPH_USE_INTERMEDIATE"):
        _d = json.load(open(os.path.join(DATA, "_curated_intermediate.json")))
        nodes, edges = _d["nodes"], _d["edges"]
        for _e in edges:
            _seen_edge.add((_e["source"], _e["target"], _e["relation"], _e["source_db"]))
        disease_mech = {}
        for _e in edges:
            if _e["relation"] == "has_mechanism":
                disease_mech.setdefault(_e["source"], []).append(_e["target"])
    else:
        nodes, edges, disease_mech = build_curated()
    analyze(nodes, edges, disease_mech, llm_merged=_llm)
