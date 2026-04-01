#!/usr/bin/env bash
# Safe, read-only query wrapper for VictoriaMetrics.
# Only ever performs HTTP GETs against localhost.
set -euo pipefail

VM_PORT="${VM_PORT:-8481}"
VM_BASE="http://localhost:${VM_PORT}/select/0/prometheus/api/v1"

usage() {
  cat <<EOF
Usage: query.sh <promql> [options]

Options:
  --range              Use query_range instead of instant query
  --start <time>       Start time (RFC3339, unix timestamp, or relative like -1h)
  --end <time>         End time (default: now)
  --step <duration>    Step for range queries (default: 60s)
  --raw                Output raw JSON (skip jq formatting)
  --check              Just check connectivity, no query

Examples:
  query.sh 'up'
  query.sh 'rate(container_cpu_usage_seconds_total[5m])' --range --start=-1h --step=60s
  query.sh --check
EOF
  exit 1
}

check_connectivity() {
  if ! curl -sf --max-time 5 "${VM_BASE}/query?query=up&limit=1" > /dev/null 2>&1; then
    echo "ERROR: Cannot reach VictoriaMetrics at localhost:${VM_PORT}" >&2
    echo "" >&2
    echo "Start a port-forward first:" >&2
    echo "  kubectl port-forward -n <monitoring-namespace> svc/<vmselect-service> ${VM_PORT}:8481 &" >&2
    echo "" >&2
    echo "For example:" >&2
    echo "  kubectl port-forward -n cf-prod-monitoring svc/vmselect-victoria-metrics-k8s-stack ${VM_PORT}:8481 &" >&2
    exit 1
  fi
}

# Parse arguments
QUERY=""
RANGE=false
START=""
END=""
STEP="60s"
RAW=false
CHECK_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --range)   RANGE=true; shift ;;
    --start)   START="$2"; shift 2 ;;
    --start=*) START="${1#--start=}"; shift ;;
    --end)     END="$2"; shift 2 ;;
    --end=*)   END="${1#--end=}"; shift ;;
    --step)    STEP="$2"; shift 2 ;;
    --step=*)  STEP="${1#--step=}"; shift ;;
    --raw)     RAW=true; shift ;;
    --check)   CHECK_ONLY=true; shift ;;
    --help|-h) usage ;;
    -*)        echo "Unknown option: $1" >&2; usage ;;
    *)
      if [[ -z "$QUERY" ]]; then
        QUERY="$1"
      else
        echo "Unexpected argument: $1" >&2; usage
      fi
      shift
      ;;
  esac
done

# Always check connectivity first
check_connectivity

if [[ "$CHECK_ONLY" == "true" ]]; then
  echo "OK: VictoriaMetrics is reachable at localhost:${VM_PORT}"
  exit 0
fi

if [[ -z "$QUERY" ]]; then
  echo "ERROR: No PromQL query provided" >&2
  usage
fi

# Build the curl command
if [[ "$RANGE" == "true" ]]; then
  URL="${VM_BASE}/query_range"
  PARAMS="query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${QUERY}'''))")"
  [[ -n "$START" ]] && PARAMS="${PARAMS}&start=${START}"
  [[ -n "$END" ]]   && PARAMS="${PARAMS}&end=${END}"
  PARAMS="${PARAMS}&step=${STEP}"
else
  URL="${VM_BASE}/query"
  PARAMS="query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${QUERY}'''))")"
fi

RESPONSE=$(curl -sf --max-time 30 "${URL}?${PARAMS}")

if [[ "$RAW" == "true" ]] || ! command -v jq &> /dev/null; then
  echo "$RESPONSE"
else
  echo "$RESPONSE" | jq .
fi
