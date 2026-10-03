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
import re
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
        "For each numbered item, reply with EXACTLY one line in this format:\n"
        "[N] YES - one short reason\n"
        "or\n"
        "[N] NO - one short reason\n"
        "where N is the item number. YES = the quote directly states or clearly entails "
        "the claim. NO = the quote does not support it, is about something else, or the "
        "claim overstates the quote. Output ONLY those lines, nothing else.\n\n"
        + "\n".join(lines))
    r = subprocess.run([sys.executable, CLAUDE, "--prompt", prompt,
                        "--max-tokens", "1024"],
                       capture_output=True, text=True, timeout=180)
    usage = {"in": 0, "out": 0}
    m = re.search(r"\[usage in=(\d+) out=(\d+)\]", r.stderr or "")
    if m:
        usage = {"in": int(m.group(1)), "out": int(m.group(2))}
    if r.returncode != 0:
        print(f"[spotcheck] claude call failed: {r.stderr[-300:]}")
        return None, usage
    return r.stdout, usage


def main():
    n = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--n" else 30
    with open(os.path.join(PROC, "llm_edges.json")) as f:
        claims = json.load(f)
    failed = []
    fp = os.path.join(PROC, "llm_edges_failed.json")
    if os.path.exists(fp):
        with open(fp) as f:
            failed = json.load(f)
    random.seed(20261003)
    sample = random.sample(claims, min(n, len(claims)))
    targets = ([{"claim": f["claim"], "quarantined": True} for f in failed] +
               [{"claim": c, "quarantined": False} for c in sample])
    print(f"[spotcheck] checking {len(targets)} claims ({len(failed)} quarantined + {len(sample)} sampled)")

    results = []
    total_in = total_out = 0
    verdict_re = re.compile(r"\[(\d+)\]\s*(YES|NO)\s*[-–:]?\s*(.*)")
    for i in range(0, len(targets), BATCH):
        chunk = targets[i:i + BATCH]
        resp, usage = ask_claude([t["claim"] for t in chunk])
        total_in += usage["in"]
        total_out += usage["out"]
        if resp is None:
            for t in chunk:
                results.append({**t, "verdict": "API_ERROR", "reason": ""})
            continue
        parsed = {}
        for line in resp.strip().split("\n"):
            m = verdict_re.match(line.strip())
            if m:
                parsed[int(m.group(1))] = (m.group(2), m.group(3).strip())
        for j, t in enumerate(chunk):
            if j in parsed:
                verdict, reason = parsed[j]
            else:
                verdict, reason = "UNCLEAR", "no parseable verdict line"
            results.append({**t, "verdict": verdict, "reason": reason})
        print(f"[spotcheck] batch {i // BATCH + 1}: done")

    yes = sum(1 for r in results if r["verdict"] == "YES")
    with open(OUT, "w") as f:
        json.dump({"sampled": len(sample), "quarantined": len(failed),
                   "yes": yes, "total": len(results),
                   "claude_tokens": {"in": total_in, "out": total_out},
                   "results": results}, f, indent=1)
    print(f"[spotcheck] {yes}/{len(results)} quotes judged supporting; "
          f"tokens in={total_in} out={total_out}; wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
