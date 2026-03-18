/**
 * PowerFlowEdge – animated edge that shows power flow direction and magnitude.
 *
 * Animation rules:
 *   • source.power_kw < 0  (generating: PV, BESS discharging)
 *       → dots flow source → target (forward)
 *   • source.power_kw > 0  (consuming: load, BESS charging, EV)
 *       → dots flow target → source (reverse; power is being pulled IN)
 *   • source is a grid device (slack bus) with power_kw > 0
 *       → grid is supplying → dots flow source → target (forward)
 *   • source is a grid device with power_kw < 0
 *       → exporting to grid → dots flow target → source (reverse)
 *   • near-zero power → no dots, dimmed edge
 *
 * Colors:
 *   • Generation (power_kw < 0): green  #4ade80
 *   • Grid supply (power_kw > 0, grid): amber  #fbbf24
 *   • Load / storage consumption (power_kw > 0, other): orange  #f97316
 *   • Idle: dark grey  #475569
 */

import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

/** Data attached to each edge by MicrogridCanvas. */
export interface PowerFlowEdgeData {
  /** power_kw of the source device (signed, simulation convention) */
  source_power_kw?: number;
  /** device_type of the source node */
  source_type?: string;
}

const IDLE_COLOR = '#475569';
const THRESHOLD_KW = 0.5; // below this → idle display

/** Number of animated dots per edge */
const DOT_COUNT = 3;

export const PowerFlowEdge: React.FC<EdgeProps> = ({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
  selected,
  markerEnd,
}) => {
  const d = (data ?? {}) as PowerFlowEdgeData;
  const sourcePower = d.source_power_kw ?? 0;
  const sourceType = d.source_type ?? '';
  const absKW = Math.abs(sourcePower);
  const isActive = absKW > THRESHOLD_KW;

  // Determine flow direction:
  //   forward  = dots travel from source handle toward target handle
  //   backward = dots travel from target handle toward source handle
  let flowForward: boolean;
  if (sourceType === 'grid') {
    // Grid: positive = importing (supplying loads) → forward
    //       negative = exporting (receiving generation) → backward
    flowForward = sourcePower >= 0;
  } else {
    // PV / BESS discharging: power_kw < 0 → generating → forward
    // Loads / BESS charging: power_kw > 0 → consuming → backward (pulled from target)
    flowForward = sourcePower <= 0;
  }

  // Edge colour
  let color = IDLE_COLOR;
  if (isActive) {
    if (sourcePower < 0) {
      color = '#4ade80'; // green – generation
    } else if (sourceType === 'grid') {
      color = '#fbbf24'; // amber – grid supply
    } else {
      color = '#f97316'; // orange – load / charge consumption
    }
  }

  // Animated dot speed: clamp between 0.8 s (very fast) and 3.5 s (slow)
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

      {/* Animated dots – only when power is significant */}
      {isActive && Array.from({ length: DOT_COUNT }, (_, i) => (
        <circle key={i} r={4} fill={color} opacity={0.95} style={{ pointerEvents: 'none' }}>
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            begin={`${-(i * duration) / DOT_COUNT}s`}
            keyPoints={flowForward ? '0;1' : '1;0'}
            keyTimes="0;1"
            calcMode="linear"
          >
            {/* mpath references the <path> rendered by BaseEdge (which sets id) */}
            <mpath href={`#${id}`} />
          </animateMotion>
        </circle>
      ))}

      {/* Power label near mid-point when selected or power is high */}
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
