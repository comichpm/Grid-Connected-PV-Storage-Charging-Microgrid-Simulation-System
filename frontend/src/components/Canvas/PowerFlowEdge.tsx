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
 * Direction algorithm
 * ───────────────────
 *   Step 1 – Identify which endpoint injects and which absorbs.
 *   Step 2 – If source injects  & target absorbs  → flow forward (source → target).
 *            If target injects  & source absorbs  → flow backward (target → source).
 *   Step 3 – SmartMeter is transparent: use the OTHER endpoint's role.
 *   Step 4 – If only one side has clear directionality, use that.
 *   Step 5 – Otherwise show no animation (idle / zero-power state).
 *
 * Colors
 * ──────
 *   #4ade80  green  – renewable generation (PV or BESS discharging)
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
 * For SmartMeter edges the direction depends on whether the OTHER endpoint
 * is a routing device (grid/SM) or a terminal device (pv/bess/load/ev):
 *   • SM ↔ terminal  – direction determined by the terminal's power_kw
 *   • SM ↔ routing   – direction determined by the SM's total_active_kw
 *     (the SM knows exactly what power its branch is producing/consuming;
 *      the Grid's power_kw spans all branches and must not be used here)
 *
 * @returns `true`  = forward  (energy flows source → target)
 *          `false` = backward (energy flows target → source)
 *          `null`  = idle / indeterminate (no animation)
 */
function getFlowDirection(
  srcPower: number, srcType: string, srcTotalActiveKW: number,
  tgtPower: number, tgtType: string, tgtTotalActiveKW: number,
): boolean | null {
  const srcIsSM = srcType === 'smart_meter';
  const tgtIsSM = tgtType === 'smart_meter';

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

  // ── General case: neither endpoint is a SmartMeter ───────────────────────
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
): string {
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
 * Key rule: for SM ↔ routing-device (Grid/SM) edges, use the SM's
 * total_active_kw as the branch power.  The Grid's power_kw spans all
 * connected branches and must NOT be used here — that would make an
 * idle branch (PV/BESS at 0 kW) appear to carry the full grid load.
 *
 * For SM ↔ terminal-device edges, use the terminal's power_kw as before.
 */
function getAbsKW(
  srcPower: number, srcType: string, srcTotalActiveKW: number,
  tgtPower: number, tgtType: string, tgtTotalActiveKW: number,
): number {
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
  // Both are non-SM devices – use the more conservative (smaller non-zero) value
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

  const flowDirection = getFlowDirection(srcPower, srcType, srcTotalKW, tgtPower, tgtType, tgtTotalKW);
  const isActive = flowDirection !== null;
  const absKW = getAbsKW(srcPower, srcType, srcTotalKW, tgtPower, tgtType, tgtTotalKW);
  const color = isActive
    ? getFlowColor(srcPower, srcType, srcTotalKW, tgtPower, tgtType, tgtTotalKW, flowDirection)
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
