---
name: victoria-metrics
description: "Query VictoriaMetrics to investigate Kubernetes cluster health, debug incidents, and answer infrastructure questions. Covers CPU, memory, pods, nodes, restarts, OOMKills, and more."
---

# VictoriaMetrics Query Skill

Query a VictoriaMetrics instance (via its Prometheus-compatible API) to investigate Kubernetes infrastructure questions.

## Safety

This skill provides two custom tools — `vm_query` and `vm_labels` — that can **only** perform HTTP GETs against `localhost:8481`. They cannot run kubectl, docker, or any other command. Use these tools exclusively for all VictoriaMetrics queries. **Do not use the `bash` tool for querying metrics.**

If the tools report that VictoriaMetrics is unreachable, tell the user to start a port-forward and stop. Do not attempt to fix connectivity.

## Tools

### `vm_query` — Run PromQL queries

```
vm_query(query: "up{job=\"node-exporter\"}")
vm_query(query: "rate(container_cpu_usage_seconds_total[5m])", range: true, start: "-1h", step: "60s")
vm_query(query: "up{job=\"node-exporter\"}", range: true, start: "2025-01-15T14:00:00Z", end: "2025-01-15T14:30:00Z", step: "30s")
```

### `vm_labels` — Discover metrics and labels

```
vm_labels(action: "names")
vm_labels(action: "values", label: "cluster")
vm_labels(action: "values", label: "namespace")
vm_labels(action: "values", label: "node")
vm_labels(action: "series", match: "node_memory_MemTotal_bytes", limit: 5)
```

## Workflow

Follow this sequence every time the skill is invoked:

### Step 1 — Check connectivity

```
vm_query(query: "up", range: false)
```

If this fails, the tool will report the error with setup instructions. **Stop and relay those to the user.**

### Step 2 — Load or create environment knowledge

Knowledge files are stored at `~/.pi/vm-knowledge/<cluster-name>.md`.

1. **Identify the environment**: query the cluster label:
   ```
   vm_labels(action: "values", label: "cluster")
   ```
   This returns the cluster name(s). If there's exactly one, use it. If multiple, ask the user which one.

2. **Load knowledge**: read `~/.pi/vm-knowledge/<cluster-name>.md` if it exists. This contains previously discovered information about the environment — node types, namespaces, useful metrics, label conventions, etc.

3. **First time? Run discovery** (only if no knowledge file exists):
   ```
   vm_labels(action: "values", label: "namespace")
   vm_labels(action: "values", label: "node")
   vm_labels(action: "values", label: "job")
   vm_query(query: "count by (node, node_kubernetes_io_instance_type) (node_uname_info)")
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

```
vm_query(query: "up{job=\"node-exporter\"}", range: true, start: "2025-01-15T14:00:00Z", end: "2025-01-15T14:30:00Z", step: "30s")
vm_query(query: "increase(kube_pod_container_status_restarts_total[5m])", range: true, start: "2025-01-15T14:00:00Z", end: "2025-01-15T14:30:00Z", step: "60s")
```

### Discovery Queries

When you don't know what's available:

```
vm_labels(action: "series", match: "{__name__=~\"node_.*\"}", limit: 10)
vm_labels(action: "values", label: "job")
vm_query(query: "count by (container) (container_cpu_usage_seconds_total{namespace=\"<ns>\"})")
```

## Tips

- **Start broad, narrow down.** Don't jump to a specific pod — first check nodes, then namespaces, then pods.
- **Use `topk()`** to avoid overwhelming output. `topk(10, ...)` is your friend.
- **Rate matters for counters.** Always wrap `_total` metrics in `rate()` or `increase()`.
- **`container!=""`** filters out pod-level aggregates in container metrics.
- **The `offset` modifier** lets you look at past values: `up offset 10m` gives you the value from 10 minutes ago.
- **Use range mode for trends**, instant queries for current state.
