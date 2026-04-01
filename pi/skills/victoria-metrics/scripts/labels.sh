#!/usr/bin/env bash
# Fetch label names or values from VictoriaMetrics.
# Read-only — only performs HTTP GETs against localhost.
set -euo pipefail

VM_PORT="${VM_PORT:-8481}"
VM_BASE="http://localhost:${VM_PORT}/select/0/prometheus/api/v1"

usage() {
  cat <<EOF
Usage:
  labels.sh names                    List all label names
  labels.sh values <label>           List values for a label
  labels.sh series '<metric_name>'   List series matching a metric

Examples:
  labels.sh names
  labels.sh values cluster
  labels.sh values namespace
  labels.sh values node
  labels.sh series 'node_memory_MemTotal_bytes'
EOF
  exit 1
}

check_connectivity() {
  if ! curl -sf --max-time 5 "${VM_BASE}/query?query=up&limit=1" > /dev/null 2>&1; then
    echo "ERROR: Cannot reach VictoriaMetrics at localhost:${VM_PORT}" >&2
    exit 1
  fi
}

check_connectivity

ACTION="${1:-}"
shift || true

case "$ACTION" in
  names)
    curl -sf --max-time 15 "${VM_BASE}/labels" | jq -r '.data[]' | sort
    ;;
  values)
    LABEL="${1:?Label name required}"
    curl -sf --max-time 15 "${VM_BASE}/label/${LABEL}/values" | jq -r '.data[]' | sort
    ;;
  series)
    MATCH="${1:?Metric name required}"
    ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${MATCH}'''))")
    curl -sf --max-time 15 "${VM_BASE}/series?match[]=${ENCODED}&limit=5" | jq .
    ;;
  *)
    usage
    ;;
esac
