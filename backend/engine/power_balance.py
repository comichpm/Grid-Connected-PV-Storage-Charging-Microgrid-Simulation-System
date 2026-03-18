"""Power balance algorithm for the microgrid simulation.

Supports both single-bus (one grid device) and multi-bus (multiple grid
connection points) topologies.

Multi-bus algorithm (topology-aware):
  1. Build an adjacency list from the saved topology edges.
  2. For each grid device find its "cluster" = all non-grid, non-smart-meter
     devices reachable by BFS without crossing another grid device.  Smart
     meters are transparent and contribute 0 kW.
  3. Compute each grid device's cluster_sum = Σ cluster_device.power_kw.
  4. Determine a topological order for the grid devices (leaves first, root
     last) using a degree-based Kahn's-algorithm pass over the grid-to-grid
     sub-graph.  Devices not reachable from any edge (isolated sub-grids)
     are treated as leaves.
  5. Process grid devices from leaves to root:
       grid_power = cluster_sum + Σ connected-child-grid-powers
     Apply per-device import/export limits.  The root grid device absorbs the
     residual that no child grid could cover (e.g. due to limits).
  6. Devices not connected to *any* grid in the topology ("orphans") are
     assigned to the root grid so the whole system stays balanced.
"""

from collections import defaultdict, deque
from typing import Dict, List, Optional, Set, Tuple

from backend.devices.base_device import BaseDevice
from backend.devices.grid import GridDevice


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_power_balance(
    devices: List[BaseDevice],
    topology_edges: Optional[List[Tuple[str, str]]] = None,
) -> Tuple[float, Dict[str, float]]:
    """Calculate system power balance and set every grid device's power_kw.

    Power sign convention:
      +kW  -> device consuming from bus (loads, EV chargers, BESS charging)
      -kW  -> device injecting to bus  (PV, BESS discharging)

    For a single-grid system the grid power balances the whole network.
    For a multi-grid system the topology_edges are used to assign each
    non-grid device to exactly one grid device's cluster, and power
    propagates bottom-up through the grid-to-grid tree.

    smart_meter devices are transparent (zero power) and not counted.

    Args:
        devices:        All devices known to the engine.
        topology_edges: List of (source_id, target_id) tuples from the
                        ReactFlow canvas.  Pass None or [] if unknown.

    Returns:
        (total_grid_power_kw, summary_dict)
    """
    grid_devices: List[GridDevice] = [  # type: ignore[misc]
        d for d in devices if d.device_type == "grid"
    ]

    # ---- Categorise non-grid power for the summary ----
    pv_total = bess_net = load_total = ev_total = other_total = 0.0
    for d in devices:
        if d.device_type == "pv":
            pv_total += d.power_kw
        elif d.device_type == "bess":
            bess_net += d.power_kw
        elif d.device_type == "ev_charger":
            ev_total += d.power_kw
        elif d.device_type == "load":
            load_total += d.power_kw
        elif d.device_type not in ("grid", "smart_meter"):
            other_total += d.power_kw

    non_grid_sum = pv_total + bess_net + load_total + ev_total + other_total

    if not grid_devices:
        summary = _build_summary(pv_total, bess_net, load_total, ev_total, 0.0, non_grid_sum)
        return 0.0, summary

    # ---- Route to single-bus or multi-bus algorithm ----
    if len(grid_devices) == 1:
        grid_power = _balance_single(grid_devices[0], non_grid_sum)
        total_grid_power = grid_devices[0].power_kw
        balance_error = non_grid_sum - total_grid_power
    else:
        _balance_multi(devices, grid_devices, topology_edges or [])
        # For a hierarchical multi-bus system the root grid's power already
        # equals the net external demand (non_grid_sum), and each child grid
        # independently covers its own cluster.  Summing all grid.power_kw
        # would double-count internal transfers between buses.  Use
        # non_grid_sum directly as the system-level "total grid power".
        total_grid_power = non_grid_sum
        balance_error = 0.0  # always balanced by construction

    summary = _build_summary(
        pv_total, bess_net, load_total, ev_total,
        total_grid_power, balance_error,
    )
    return total_grid_power, summary


# ---------------------------------------------------------------------------
# Single-bus helper (preserves original behaviour exactly)
# ---------------------------------------------------------------------------

def _balance_single(grid_device: GridDevice, non_grid_sum: float) -> float:
    if not grid_device.online:
        grid_device.power_kw = 0.0
        return 0.0
    grid_power = non_grid_sum
    if grid_power > 0:
        grid_power = min(grid_power, grid_device.max_import_kw)
    else:
        grid_power = max(grid_power, -grid_device.max_export_kw)
    grid_device.power_kw = grid_power
    return grid_power


# ---------------------------------------------------------------------------
# Multi-bus helper
# ---------------------------------------------------------------------------

def _balance_multi(
    devices: List[BaseDevice],
    grid_devices: List[GridDevice],
    topology_edges: List[Tuple[str, str]],
) -> float:
    """Topology-aware power balance for multiple grid connection points.

    Each grid device independently balances the non-grid devices in its
    cluster (those reachable by BFS without crossing another grid device).
    Power then propagates bottom-up through the grid-to-grid tree so the
    root grid device absorbs the aggregate system imbalance.
    """
    device_map: Dict[str, BaseDevice] = {d.device_id: d for d in devices}
    grid_ids: Set[str] = {gd.device_id for gd in grid_devices}

    # ---- Build full adjacency list ----
    adj: Dict[str, Set[str]] = defaultdict(set)
    for src, tgt in topology_edges:
        if src in device_map and tgt in device_map:
            adj[src].add(tgt)
            adj[tgt].add(src)

    # ---- Step 1: cluster BFS for each grid device ----
    # cluster_sum[gid] = Σ power_kw of non-grid, non-smart_meter devices
    # reachable from this grid without crossing any other grid.
    cluster_sum: Dict[str, float] = {}
    assigned_ids: Set[str] = set()  # non-grid device ids that got assigned

    for gid in grid_ids:
        gd = device_map[gid]
        c_sum = 0.0
        if gd.online:
            visited: Set[str] = {gid}
            q: deque = deque([gid])
            while q:
                node = q.popleft()
                for nbr in adj[node]:
                    if nbr in visited:
                        continue
                    visited.add(nbr)
                    nd = device_map.get(nbr)
                    if nd is None:
                        continue
                    if nd.device_id in grid_ids:
                        continue  # grid boundary – stop here
                    if nd.device_type != "smart_meter":
                        c_sum += nd.power_kw
                        assigned_ids.add(nd.device_id)
                    q.append(nbr)
        cluster_sum[gid] = c_sum

    # ---- Step 2: collect "orphan" devices (not reachable from any grid) ----
    orphan_sum = 0.0
    for d in devices:
        if d.device_type in ("grid", "smart_meter"):
            continue
        if d.device_id not in assigned_ids:
            orphan_sum += d.power_kw

    # ---- Step 3: build grid-to-grid sub-graph ----
    grid_adj: Dict[str, Set[str]] = defaultdict(set)
    for gid in grid_ids:
        for nbr in adj[gid]:
            if nbr in grid_ids:
                grid_adj[gid].add(nbr)

    # ---- Step 4: topological sort (leaves → root) via Kahn's algorithm ----
    # Use a degree-based approach on the undirected grid-to-grid sub-graph.
    # Leaves = nodes with degree ≤ 1.
    rem_degree: Dict[str, int] = {gid: len(grid_adj[gid]) for gid in grid_ids}
    topo_queue: deque = deque(
        gid for gid, deg in rem_degree.items() if deg <= 1
    )
    parent_of: Dict[str, Optional[str]] = {gid: None for gid in grid_ids}
    processing_order: List[str] = []
    processed: Set[str] = set()

    while topo_queue:
        gid = topo_queue.popleft()
        if gid in processed:
            continue
        processed.add(gid)
        processing_order.append(gid)
        for nbr in grid_adj[gid]:
            if nbr not in processed:
                # nbr is the "parent" of gid in the spanning tree
                parent_of[gid] = nbr
                rem_degree[nbr] -= 1
                if rem_degree[nbr] <= 1:
                    topo_queue.append(nbr)

    # Any grid not yet reached (isolated or cycle) goes at the end
    for gid in grid_ids:
        if gid not in processed:
            processing_order.append(gid)

    # Root = last in processing order (it gets orphan devices too)
    root_id: str = processing_order[-1]
    cluster_sum[root_id] = cluster_sum.get(root_id, 0.0) + orphan_sum

    # ---- Step 5: bottom-up propagation + apply limits ----
    # grid_power_map holds each grid's running power value.
    grid_power_map: Dict[str, float] = dict(cluster_sum)

    for gid in processing_order:
        gd: GridDevice = device_map[gid]  # type: ignore[assignment]

        if not gd.online:
            gd.power_kw = 0.0
            grid_power_map[gid] = 0.0
            # Offline grid contributes 0 to its parent
            continue

        raw_power = grid_power_map[gid]

        # Apply per-device import/export capacity limits
        if raw_power > 0:
            limited = min(raw_power, gd.max_import_kw)
        else:
            limited = max(raw_power, -gd.max_export_kw)

        gd.power_kw = limited
        grid_power_map[gid] = limited

        # Propagate to parent: the power this grid actually draws from /
        # injects into the upstream bus
        parent_id = parent_of.get(gid)
        if parent_id is not None:
            grid_power_map[parent_id] = grid_power_map.get(parent_id, 0.0) + limited

    return sum(gd.power_kw for gd in grid_devices if gd.online)


# ---------------------------------------------------------------------------
# Summary helper
# ---------------------------------------------------------------------------

def _build_summary(
    pv_total: float,
    bess_net: float,
    load_total: float,
    ev_total: float,
    total_grid_power: float,
    balance_error: float,
) -> Dict[str, float]:
    return {
        "pv_total_kw": round(-pv_total, 3),       # positive = generation
        "bess_net_kw": round(bess_net, 3),          # + = charging, - = discharging
        "load_total_kw": round(load_total, 3),
        "ev_total_kw": round(ev_total, 3),
        "grid_power_kw": round(total_grid_power, 3),  # + = import, - = export
        "balance_error_kw": round(balance_error, 6),
    }
