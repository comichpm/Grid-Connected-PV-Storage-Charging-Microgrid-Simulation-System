/**
 * NodeHandles – renders connection handles at 25 %, 50 % and 75 % along every
 * edge of a node, giving users 12 freely-selectable connection points so that
 * wires can start / end at any position on the node border (Req: 任意位置连接).
 */
import React from 'react';
import { Handle, Position } from '@xyflow/react';

interface NodeHandlesProps {
  /** Make all handles act as both source and target (default true) */
  bidirectional?: boolean;
}

const EDGE_OFFSETS = ['25%', '50%', '75%'];

export const NodeHandles: React.FC<NodeHandlesProps> = ({ bidirectional = true }) => {
  const type = bidirectional ? 'source' : 'source'; // Loose mode treats all as source+target
  return (
    <>
      {/* Top edge */}
      {EDGE_OFFSETS.map((pct, i) => (
        <Handle
          key={`top-${i}`}
          type={type}
          position={Position.Top}
          id={`top-${i}`}
          style={{ left: pct, transform: 'translateX(-50%)' }}
          className="node-handle-multi"
        />
      ))}
      {/* Bottom edge */}
      {EDGE_OFFSETS.map((pct, i) => (
        <Handle
          key={`bottom-${i}`}
          type={type}
          position={Position.Bottom}
          id={`bottom-${i}`}
          style={{ left: pct, transform: 'translateX(-50%)' }}
          className="node-handle-multi"
        />
      ))}
      {/* Left edge */}
      {EDGE_OFFSETS.map((pct, i) => (
        <Handle
          key={`left-${i}`}
          type="target"
          position={Position.Left}
          id={`left-${i}`}
          style={{ top: pct, transform: 'translateY(-50%)' }}
          className="node-handle-multi"
        />
      ))}
      {/* Right edge */}
      {EDGE_OFFSETS.map((pct, i) => (
        <Handle
          key={`right-${i}`}
          type={type}
          position={Position.Right}
          id={`right-${i}`}
          style={{ top: pct, transform: 'translateY(-50%)' }}
          className="node-handle-multi"
        />
      ))}
    </>
  );
};

export default NodeHandles;
