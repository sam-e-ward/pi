---
name: victoria-metrics
description: "Query VictoriaMetrics to investigate Kubernetes cluster health, debug incidents, and answer infrastructure questions. Covers CPU, memory, pods, nodes, restarts, OOMKills, and more."
---

# VictoriaMetrics Query Skill

Query a VictoriaMetrics instance (via its Prometheus-compatible API) to investigate Kubernetes infrastructure questions.

## ⛔ Safety Rules — READ FIRST

1. **Only run `curl` commands against `http://localhost:8481`** (or the port in `$VM_PORT`). Use the provided scripts.
2. **Never run `kubectl`, `docker`, `helm`, or any other CLI tool.** Not even read-only ones. The only executables you may invoke are the scripts in this skill's `scripts/` directory.
3. **Never attempt to start, fix, or configure the port-forward.** If connectivity fails, tell the user and stop.
4. **This is a read-only investigation tool.** Do not suggest or execute any remediation commands.

## Prerequisites

The user must have a VictoriaMetrics vmselect port-forward running before invoking this skill:

```bash
kubectl port-forward -n <monitoring-namespace> svc/<vmselect-service> 8481:8481 &
```

## Scripts

All scripts are in the `scripts/` subdirectory of this skill. Run them from that directory.

### `query.sh` — Run PromQL queries

```bash
# Instant query
./scripts/query.sh 'up{job="node-exporter"}'

# Range query (last hour, 60s steps)
./scripts/query.sh 'rate(container_cpu_usage_seconds_total[5m])' --range --start=-1h --step=60s

# Check connectivity only
./scripts/query.sh --check
```

### `labels.sh` — Discover metrics and labels

```bash
# List all label names
./scripts/labels.sh names

# List values for a specific label
./scripts/labels.sh values cluster
./scripts/labels.sh values namespace
./scripts/labels.sh values node

# Inspect series for a metric
./scripts/labels.sh series 'node_memory_MemTotal_bytes'
```

## Workflow

Follow this sequence every time the skill is invoked:

### Step 1 — Check connectivity

```bash
./scripts/query.sh --check
```

If this fails, print the error (which includes setup instructions) and **stop**. Do not proceed.

### Step 2 — Load or create environment knowledge

Knowledge files are stored at `~/.pi/vm-knowledge/<cluster-name>.md`.

1. **Identify the environment**: query the cluster label:
   ```bash
   ./scripts/labels.sh values cluster
   ```
   This returns the cluster name(s). If there's exactly one, use it. If multiple, ask the user which one.

2. **Load knowledge**: read `~/.pi/vm-knowledge/<cluster-name>.md` if it exists. This contains previously discovered information about the environment — node types, namespaces, useful metrics, label conventions, etc.

3. **First time? Run discovery** (only if no knowledge file exists):
   ```bash
   ./scripts/labels.sh values namespace
   ./scripts/labels.sh values node
   ./scripts/labels.sh values job
   ./scripts/query.sh 'count by (node, node_kubernetes_io_instance_type) (node_uname_info)'
   ./scripts/query.sh 'kube_namespace_status_phase{phase="Active"}'
   ```
   Then create the knowledge file with what was found. Use the template below.

### Step 3 — Investigate the user's question

Use targeted PromQL queries from the cookbook below. Iterate: run a query, interpret results, refine.

### Step 4 — Update knowledge

If you discovered anything new (a useful metric, a label pattern, a node group, the structure of a namespace), **append it to the knowledge file** so future sessions benefit.

## Knowledge File Template

```markdown
# Environment: <cluster-name>

## Cluster Info
- Cluster: <cluster-name>
- Discovered: <date>

## Namespaces
- <list of namespaces>

## Node Groups
- <instance-type>: <description/role> (node names)

## Key Labels
- <label>: <what it identifies>

## Useful Metrics
- <metric_name> — <what it measures>

## Notes
- <anything learned during investigations>
```

## PromQL Cookbook

### Node Health

```promql
# Is a node up? (by node-exporter)
up{job="node-exporter"}

# Node conditions (Ready, DiskPressure, MemoryPressure, etc.)
kube_node_status_condition{condition="Ready", status="true"}

# When did nodes last boot?
node_boot_time_seconds

# Nodes that disappeared (were up 10m ago but not now)
up{job="node-exporter"} offset 10m unless up{job="node-exporter"}
```

### CPU

```promql
# CPU usage by node (percentage, 5m average)
100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))

# CPU usage by pod (cores)
sum by (namespace, pod) (rate(container_cpu_usage_seconds_total[5m]))

# Top CPU consumers in a namespace
topk(10, sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="<ns>"}[5m])))

# CPU throttling by pod
sum by (namespace, pod) (rate(container_cpu_cfs_throttled_seconds_total[5m]))
```

### Memory

```promql
# Node RAM usage (percentage)
100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)

# Pod memory working set (the metric k8s uses for OOM decisions)
sum by (namespace, pod) (container_memory_working_set_bytes{container!=""})

# Top memory consumers in a namespace
topk(10, sum by (pod) (container_memory_working_set_bytes{namespace="<ns>", container!=""}))

# Memory vs requests
sum by (namespace, pod) (container_memory_working_set_bytes{container!=""})
  /
sum by (namespace, pod) (kube_pod_container_resource_requests{resource="memory"})
```

### Pod Restarts & OOMKills

```promql
# Restart count by pod
sum by (namespace, pod) (kube_pod_container_status_restarts_total)

# Pods that restarted recently (increase in last hour)
sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total[1h])) > 0

# OOMKilled containers
kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}

# Pods not ready
kube_pod_status_ready{condition="false"}
```

### Disk

```promql
# Node filesystem usage (percentage)
100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes)

# PVC usage (if supported)
kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes * 100
```

### Network

```promql
# Network receive rate by pod (bytes/sec)
sum by (namespace, pod) (rate(container_network_receive_bytes_total[5m]))

# Network transmit rate by pod
sum by (namespace, pod) (rate(container_network_transmit_bytes_total[5m]))
```

### Deployments & Scaling

```promql
# Deployment replica status
kube_deployment_status_replicas_available
kube_deployment_spec_replicas

# Deployments with unavailable replicas
kube_deployment_spec_replicas - kube_deployment_status_replicas_available > 0

# HPA current vs desired
kube_horizontalpodautoscaler_status_current_replicas
kube_horizontalpodautoscaler_spec_max_replicas
```

### Time-based Investigation

When the user says something happened "around 14:15", use range queries centred on that time:

```bash
# Check node status around a specific time (30min window, 30s steps)
./scripts/query.sh 'up{job="node-exporter"}' --range --start=2025-01-15T14:00:00Z --end=2025-01-15T14:30:00Z --step=30s

# What pods restarted in that window?
./scripts/query.sh 'increase(kube_pod_container_status_restarts_total[5m])' --range --start=2025-01-15T14:00:00Z --end=2025-01-15T14:30:00Z --step=60s
```

### Discovery Queries

When you don't know what's available:

```bash
# What metrics exist matching a pattern?
./scripts/labels.sh series '{__name__=~"node_.*"}'

# What jobs are reporting?
./scripts/labels.sh values job

# What containers exist in a namespace?
./scripts/query.sh 'count by (container) (container_cpu_usage_seconds_total{namespace="<ns>"})'
```

## Tips

- **Start broad, narrow down.** Don't jump to a specific pod — first check nodes, then namespaces, then pods.
- **Use `topk()`** to avoid overwhelming output. `topk(10, ...)` is your friend.
- **Rate matters for counters.** Always wrap `_total` metrics in `rate()` or `increase()`.
- **`container!=""`** filters out pod-level aggregates in container metrics.
- **The `offset` modifier** lets you look at past values: `up offset 10m` gives you the value from 10 minutes ago.
- **Use `--range` for trends**, instant queries for current state.
