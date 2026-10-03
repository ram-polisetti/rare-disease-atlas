#!/usr/bin/env python3
"""Phase 2 grounded verification, stage 2 (semantic, SAMPLE).

Claude (haiku, cheap) spot-checks whether each claim's source_quote actually
supports the claim. Samples: all quarantined failures (if any) + a random
stratified sample of verified claims. Small batched calls to protect the $25
credit budget.

Usage: ~/workspace/.venv/bin/python scripts/claude_spotcheck.py [--n 30]
Writes: data/processed/claude_quote_spotcheck.json
"""
import json
import os
import random
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BASE, "data", "processed")
CLAUDE = os.path.expanduser("~/workspace/skills/anthropic/bin/claude_verify.py")
OUT = os.path.join(PROC, "claude_quote_spotcheck.json")
BATCH = 5


def ask_claude(items):
    lines = []
    for i, c in enumerate(items):
        lines.append(
            f"[{i}] Claim: {c.get('subject')} --{c.get('relation')}--> {c.get('object')} "
            f"(PMID {c.get('pmid')}, confidence {c.get('confidence')})\n"
            f"    Quote: \"{(c.get('source_quote') or '')[:400]}\"")
    prompt = (
        "You are checking whether quoted evidence supports biomedical claims.\n"
        "For each numbered item, answer with the number and YES or NO plus one short "
        "reason. YES = the quote directly states or clearly entails the claim. "
        "NO = the quote does not support it, is about something else, or the claim "
        "overstates the quote.\n\n" + "\n".join(lines))
    r = subprocess.run([sys.executable, CLAUDE, "--prompt", prompt,
                        "--max-tokens", 1024],
                       capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        print(f"[spotcheck] claude call failed: {r.stderr[-300:]}")
        return None
    return r.stdout


def main():
    n = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--n" else 30
    claims = json.load(open(os.path.join(PROC, "llm_edges.json")))
    failed = []
    fp = os.path.join(PROC, "llm_edges_failed.json")
    if os.path.exists(fp):
        failed = json.load(open(fp))
    random.seed(20261003)
    sample = random.sample(claims, min(n, len(claims)))
    targets = ([{"claim": f["claim"], "quarantined": True} for f in failed] +
               [{"claim": c, "quarantined": False} for c in sample])
    print(f"[spotcheck] checking {len(targets)} claims ({len(failed)} quarantined + {len(sample)} sampled)")

    results = []
    for i in range(0, len(targets), BATCH):
        chunk = targets[i:i + BATCH]
        resp = ask_claude([t["claim"] for t in chunk])
        if resp is None:
            for t in chunk:
                results.append({**t, "verdict": "API_ERROR", "reason": ""})
            continue
        for t, line in zip(chunk, resp.strip().split("\n")):
            line = line.strip()
            verdict = "YES" if line.lstrip("[0123456789] ").startswith("YES") else (
                "NO" if "NO" in line[:12] else "UNCLEAR")
            results.append({**t, "verdict": verdict, "reason": line})
        print(f"[spotcheck] batch {i // BATCH + 1}: done")

    yes = sum(1 for r in results if r["verdict"] == "YES")
    json.dump({"sampled": len(sample), "quarantined": len(failed),
               "yes": yes, "total": len(results), "results": results},
              open(OUT, "w"), indent=1)
    print(f"[spotcheck] {yes}/{len(results)} quotes judged supporting; wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
