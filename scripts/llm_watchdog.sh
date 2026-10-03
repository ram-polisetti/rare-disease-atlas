#!/bin/bash
# Phase-2 watchdog: poll for data/processed/llm_edges.json every 10 min until
# 19:30 EDT (23:30 UTC) 2026-10-03, then merge or log omission.
PROJ=~/workspace/hack-nation-rare-disease-atlas
LLM=$PROJ/data/processed/llm_edges.json
LOG=$PROJ/docs/log_fragments/graph.md
DEADLINE=$(date -u -d "2026-10-03 23:30:00" +%s)
while [ "$(date -u +%s)" -lt "$DEADLINE" ]; do
  if [ -f "$LLM" ]; then
    echo "[watchdog] llm_edges.json found at $(date -u); running merge"
    ~/workspace/.venv/bin/python $PROJ/scripts/merge_llm_edges.py
    echo "[watchdog] merge exit=$? at $(date -u)"
    exit 0
  fi
  sleep 600
done
cat >> "$LOG" << 'LOGEOF'

## Phase 2 merge — OMITTED (2026-10-03 19:30 EDT)
- data/processed/llm_edges.json never appeared by the 7:30 PM EDT deadline.
  Graph finalized WITHOUT LLM edges (meta.llm_edges_merged=false).
LOGEOF
echo "[watchdog] deadline 19:30 EDT reached; llm_edges.json absent; omission logged"
