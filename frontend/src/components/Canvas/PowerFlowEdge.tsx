/**
 * PowerFlowEdge – animated edge that shows power flow direction and magnitude.
 *
 * Design principle
 * ────────────────
 * The direction of the animated dots is determined by examining BOTH endpoints,
 * not just the source.  This is necessary because:
 *
 *  1. SmartMeter devices always have power_kw = 0 (they only measure other
 *     devices).  Using only the source's power would always yield "forward" for
 *     any edge where the smart meter is the source node.
 *  2. The source / target ordering in a React Flow edge depends on which handle
 *     the user started or finished the drag on — it does not necessarily match
 *     the physical energy-flow direction.
 *
 * Power sign convention (from backend)
 * ─────────────────────────────────────
 *   Non-grid devices:  power_kw > 0 = consuming from bus
 *                      power_kw < 0 = injecting into bus  (generation / discharge)
 *   Grid (slack bus):  power_kw > 0 = importing  (grid supplies the local bus)
 *                      power_kw < 0 = exporting  (grid absorbs surplus generation)
 *   SmartMeter:        power_kw is always 0; it is treated as transparent.
 *
 * Grid↔Grid inter-bus edges
 * ─────────────────────────
 *   Each Grid's power_kw = its total exchange with ITS OWN local bus.
 *   On the wire between two Grid nodes the "branch power" = child Grid's power_kw,
 *   because the child bus is balanced locally and whatever remains flows on the wire.
 *
 *   The backend sets parent_grid_id on every non-root Grid device.
 *   MicrogridCanvas computes grid_child_is_source from this:
 *     true  → the edge's source node is the child (sub-bus)
 *     false → the edge's target node is the child (sub-bus)
 *     null  → no parent/child relationship (root↔root, or not yet known)
 *
 *   Direction:  child.power_kw > 0 → child imports  → parent→child (forward if child=target)
 *               child.power_kw < 0 → child exports  → child→parent (forward if child=source)
 *   Magnitude:  |child.power_kw|
 *   Color:      amber  – child importing (parent supplies child's bus)
 *               green  – child exporting (child's bus has net generation)
 *
 * SmartMeter edges
 * ────────────────
 *   • SM ↔ terminal  – direction/magnitude from the terminal's own power_kw
 *   • SM ↔ routing   – direction/magnitude from the SM's total_active_kw
 *
 * Colors
 * ──────
 *   #4ade80  green  – renewable generation (PV, BESS discharge, sub-bus export)
 *   #fbbf24  amber  – grid supply (importing)
 *   #f97316  orange – load or storage charging
 *   #475569  grey   – idle (below threshold)
 */

import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

/** Data attached to each edge by MicrogridCanvas. */
export interface PowerFlowEdgeData {
  /** power_kw of the SOURCE device (signed, simulation convention) */
  source_power_kw?: number;
  /** device_type string of the SOURCE node */
  source_type?: string;
  /**
   * total_active_kw measured by the SOURCE node when it is a SmartMeter.
   * This is the branch-local sum of monitored devices – NOT the adjacent
   * grid's total power, which would incorrectly aggregate all branches.
   */
  source_total_active_kw?: number;
  /** power_kw of the TARGET device */
  target_power_kw?: number;
  /** device_type string of the TARGET node */
  target_type?: string;
  /**
   * total_active_kw measured by the TARGET node when it is a SmartMeter.
   */
  target_total_active_kw?: number;
  /**
   * For Grid↔Grid inter-bus edges only: which endpoint is the child sub-bus?
   *   true  → source node is the child (its power_kw = branch power)
   *   false → target node is the child (its power_kw = branch power)
   *   null  → root↔root edge or topology not yet resolved
   *
   * Set by MicrogridCanvas from the backend's parent_grid_id field.
   */
  grid_child_is_source?: boolean | null;
}

const IDLE_COLOR = '#475569';
const THRESHOLD_KW = 0.5;
const DOT_COUNT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Physics helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Routing" devices are intermediate nodes that aggregate or relay power from
 * multiple branches (grid slack-bus, smart meter).
 *
 * "Terminal" devices are leaf nodes with a definitive individual power_kw
 * (pv, bess, load, ev_charger).
 *
 * This distinction is crucial for branch-independent power-flow display:
 *   • SM ↔ terminal  →  use the terminal's power_kw  (branch magnitude is the device's own output/input)
 *   • SM ↔ routing   →  use the SM's total_active_kw  (Grid.power_kw aggregates ALL branches; wrong for this one)
 */
function isRoutingDevice(type: string): boolean {
  return type === 'grid' || type === 'smart_meter';
}

/**
 * Returns true when the device is currently injecting energy into the local bus
 * (i.e., acting as a power source from the bus's perspective).
 */
function injectsEnergy(power: number, type: string): boolean {
  // Grid: positive power = importing from external grid = supplying the local bus
  if (type === 'grid') return power > THRESHOLD_KW;
  // PV and BESS-discharging: negative power = generation
  if (type === 'pv' || type === 'bess') return power < -THRESHOLD_KW;
  // EV charger and load never inject
  // SmartMeter is transparent – never treated as injector here
  return false;
}

/**
 * Returns true when the device is currently absorbing energy from the local bus
 * (i.e., acting as a power sink from the bus's perspective).
 */
function absorbsEnergy(power: number, type: string): boolean {
  // Grid: negative power = exporting surplus to external grid = absorbing from bus
  if (type === 'grid') return power < -THRESHOLD_KW;
  // Loads and EV chargers always absorb (when active)
  if (type === 'load' || type === 'ev_charger') return power > THRESHOLD_KW;
  // BESS charging
  if (type === 'bess') return power > THRESHOLD_KW;
  // SmartMeter: transparent
  return false;
}

/**
 * Determine the physical flow direction for an edge.
 *
 * For Grid↔Grid edges: uses the backend-provided gridChildIsSource to pick
 * the child's power_kw as the authoritative branch power:
 *   child.power_kw > 0 (importing) → parent→child
 *   child.power_kw < 0 (exporting) → child→parent
 *
 * For SmartMeter edges the direction depends on whether the OTHER endpoint
 * is a routing device (grid/SM) or a terminal device (pv/bess/load/ev):
 *   • SM ↔ terminal  – direction determined by the terminal's power_kw
 *   • SM ↔ routing   – direction determined by the SM's total_active_kw
 *
 * @returns `true`  = forward  (energy flows source → target)
 *          `false` = backward (energy flows target → source)
 *          `null`  = idle / indeterminate (no animation)
 */
function getFlowDirection(
  srcPower: number, srcType: string, srcTotalActiveKW: number,
  tgtPower: number, tgtType: string, tgtTotalActiveKW: number,
  gridChildIsSource: boolean | null,
): boolean | null {
  const srcIsSM = srcType === 'smart_meter';
  const tgtIsSM = tgtType === 'smart_meter';

  // ── Grid↔Grid inter-bus edge ──────────────────────────────────────────────
  // Use the child's power_kw as the authoritative branch power.
  // Do NOT use a magnitude heuristic ("larger power = child") because it fails
  // when both branches import (parent power > any child power).
  if (srcType === 'grid' && tgtType === 'grid') {
    let childPower: number;
    let childIsSrc: boolean;

    if (gridChildIsSource === true) {
      childPower = srcPower;
      childIsSrc = true;
    } else if (gridChildIsSource === false) {
      childPower = tgtPower;
      childIsSrc = false;
    } else {
      // No parent-child relationship known (root↔root or pre-simulation).
      // Fall back to a sign-based heuristic: if they have opposite signs,
      // the one that is exporting (neg) is the child.
      if (srcPower < -THRESHOLD_KW && tgtPower > THRESHOLD_KW) return true;
      if (tgtPower < -THRESHOLD_KW && srcPower > THRESHOLD_KW) return false;
      // Same sign or zero → indeterminate
      return null;
    }

    if (Math.abs(childPower) < THRESHOLD_KW) return null;
    // child imports (pos) → parent→child; child exports (neg) → child→parent
    if (childPower > THRESHOLD_KW)  return childIsSrc ? false : true;
    if (childPower < -THRESHOLD_KW) return childIsSrc ? true  : false;
    return null;
  }

  // ── SmartMeter as source ──────────────────────────────────────────────────
  if (srcIsSM && !tgtIsSM) {
    if (isRoutingDevice(tgtType)) {
      // SM → Grid (or SM → SM): use THIS SM's branch power, not the Grid's total
      if (srcTotalActiveKW < -THRESHOLD_KW) return true;  // net generation → export (SM→Grid)
      if (srcTotalActiveKW > THRESHOLD_KW)  return false; // net consumption → import (Grid→SM)
      return null;
    }
    // SM → terminal device: direction from the terminal's own power
    if (injectsEnergy(tgtPower, tgtType)) return false; // terminal generates → terminal→SM
    if (absorbsEnergy(tgtPower, tgtType)) return true;  // terminal consumes  → SM→terminal
    return null;
  }

  // ── SmartMeter as target ──────────────────────────────────────────────────
  if (tgtIsSM && !srcIsSM) {
    if (isRoutingDevice(srcType)) {
      // Grid → SM (or SM → SM): use THIS SM's branch power, not the Grid's total
      if (tgtTotalActiveKW < -THRESHOLD_KW) return false; // net generation → export (SM→Grid = backward)
      if (tgtTotalActiveKW > THRESHOLD_KW)  return true;  // net consumption → import (Grid→SM = forward)
      return null;
    }
    // terminal → SM: direction from the terminal's own power
    if (injectsEnergy(srcPower, srcType)) return true;  // terminal generates → terminal→SM
    if (absorbsEnergy(srcPower, srcType)) return false; // terminal consumes  → SM→terminal
    return null;
  }

  // ── General case: neither endpoint is a SmartMeter or Grid↔Grid ──────────
  const srcInj = injectsEnergy(srcPower, srcType);
  const tgtInj = injectsEnergy(tgtPower, tgtType);
  const srcAbs = absorbsEnergy(srcPower, srcType);
  const tgtAbs = absorbsEnergy(tgtPower, tgtType);

  // Clear case: one injects, the other absorbs
  if (srcInj && tgtAbs) return true;
  if (tgtInj && srcAbs) return false;

  // Single-sided heuristic (target state not yet available, or both same role)
  if (srcInj) return true;
  if (tgtInj) return false;
  if (srcAbs) return false;
  if (tgtAbs) return true;

  return null; // truly idle
}

/** Pick the edge color based on which device is the physical energy injector. */
function getFlowColor(
  srcPower: number, srcType: string, srcTotalActiveKW: number,
  tgtPower: number, tgtType: string, tgtTotalActiveKW: number,
  flowForward: boolean,
  gridChildIsSource: boolean | null,
): string {
  // Grid↔Grid: color from the child's power direction
  //   child exporting (neg) → green  (sub-bus has net generation flowing upstream)
  //   child importing (pos) → amber  (parent/external grid supplies child's bus)
  if (srcType === 'grid' && tgtType === 'grid') {
    const childPower = gridChildIsSource === true  ? srcPower
                     : gridChildIsSource === false ? tgtPower
                     : (flowForward ? srcPower : tgtPower);
    return childPower < -THRESHOLD_KW ? '#4ade80' : '#fbbf24';
  }

  const injType  = flowForward ? srcType  : tgtType;
  const injPower = flowForward ? srcPower : tgtPower;

  // SM ↔ routing edge: color from the SM's measured branch power
  if (injType === 'smart_meter') {
    const smKW = flowForward ? srcTotalActiveKW : tgtTotalActiveKW;
    if (smKW < -THRESHOLD_KW) return '#4ade80'; // net generation → green
    return '#f97316';                            // net consumption → orange
  }

  if (injType === 'pv') return '#4ade80';                              // green – solar
  if (injType === 'bess' && injPower < -THRESHOLD_KW) return '#4ade80'; // green – BESS discharge
  if (injType === 'grid') return '#fbbf24';                             // amber – grid supply

  return '#f97316'; // orange – load / EV / BESS charging
}

/**
 * Representative power magnitude for the animation speed and label.
 *
 * Grid↔Grid: use the child's power_kw (= the branch power on the wire).
 * SM ↔ routing-device: use the SM's total_active_kw.
 * SM ↔ terminal: use the terminal's power_kw.
 * General: smaller non-zero value.
 */
function getAbsKW(
  srcPower: number, srcType: string, srcTotalActiveKW: number,
  tgtPower: number, tgtType: string, tgtTotalActiveKW: number,
  gridChildIsSource: boolean | null,
): number {
  // Grid↔Grid: child's power_kw is the actual branch power
  if (srcType === 'grid' && tgtType === 'grid') {
    if (gridChildIsSource === true)  return Math.abs(srcPower);
    if (gridChildIsSource === false) return Math.abs(tgtPower);
    return Math.max(Math.abs(srcPower), Math.abs(tgtPower)); // fallback
  }
  if (srcType === 'smart_meter') {
    // SM is source: choose magnitude based on what the target is
    return isRoutingDevice(tgtType)
      ? Math.abs(srcTotalActiveKW)  // SM↔Grid or SM↔SM: use SM's branch measurement
      : Math.abs(tgtPower);         // SM↔terminal: use the terminal's power
  }
  if (tgtType === 'smart_meter') {
    // SM is target: choose magnitude based on what the source is
    return isRoutingDevice(srcType)
      ? Math.abs(tgtTotalActiveKW)  // Grid↔SM or SM↔SM: use SM's branch measurement
      : Math.abs(srcPower);         // terminal↔SM: use the terminal's power
  }
  // Both are non-SM, non-Grid devices – use the more conservative (smaller non-zero) value
  const sa = Math.abs(srcPower);
  const ta = Math.abs(tgtPower);
  if (sa < THRESHOLD_KW) return ta;
  if (ta < THRESHOLD_KW) return sa;
  return Math.min(sa, ta);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const PowerFlowEdge: React.FC<EdgeProps> = ({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
  selected,
  markerEnd,
}) => {
  const d = (data ?? {}) as PowerFlowEdgeData;
  const srcPower = d.source_power_kw ?? 0;
  const srcType  = d.source_type  ?? '';
  const srcTotalKW = d.source_total_active_kw ?? 0;
  const tgtPower = d.target_power_kw ?? 0;
  const tgtType  = d.target_type  ?? '';
  const tgtTotalKW = d.target_total_active_kw ?? 0;
  const gridChildIsSource = d.grid_child_is_source ?? null;

  const flowDirection = getFlowDirection(srcPower, srcType, srcTotalKW, tgtPower, tgtType, tgtTotalKW, gridChildIsSource);
  const isActive = flowDirection !== null;
  const absKW = getAbsKW(srcPower, srcType, srcTotalKW, tgtPower, tgtType, tgtTotalKW, gridChildIsSource);
  const color = isActive
    ? getFlowColor(srcPower, srcType, srcTotalKW, tgtPower, tgtType, tgtTotalKW, flowDirection, gridChildIsSource)
    : IDLE_COLOR;

  // Dot speed: faster for higher power (0.8 s → 3.5 s range)
  const duration = isActive ? Math.max(0.8, 3.5 - absKW / 120) : 3.5;

  const [edgePath] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const strokeWidth = selected ? 3 : isActive ? 2 : 1.5;

  return (
    <>
      {/* Base edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth,
          opacity: isActive ? 0.85 : 0.4,
        }}
      />

      {/* Animated dots — only when power is above threshold */}
      {isActive && Array.from({ length: DOT_COUNT }, (_, i) => (
        <circle key={i} r={4} fill={color} opacity={0.95} style={{ pointerEvents: 'none' }}>
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            begin={`${-(i * duration) / DOT_COUNT}s`}
            keyPoints={flowDirection ? '0;1' : '1;0'}
            keyTimes="0;1"
            calcMode="linear"
          >
            <mpath href={`#${id}`} />
          </animateMotion>
        </circle>
      ))}

      {/* Power label near mid-point when selected or power is significant */}
      {isActive && (selected || absKW > 50) && (
        <text
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2 - 8}
          fill={color}
          fontSize={10}
          textAnchor="middle"
          style={{ pointerEvents: 'none', fontWeight: 600 }}
        >
          {absKW >= 1 ? `${absKW.toFixed(0)}kW` : `${(absKW * 1000).toFixed(0)}W`}
        </text>
      )}
    </>
  );
};

export default PowerFlowEdge;
