import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { DeviceState } from '../../types';

interface GridNodeData extends Record<string, unknown> {
  state?: DeviceState;
  label: string;
  onClick?: () => void;
}

type GridNodeType = Node<GridNodeData, 'grid'>;

export const GridNode: React.FC<NodeProps<GridNodeType>> = ({ data, selected }) => {
  const s = data.state;
  const power = s?.power_kw ?? 0;
  const statusText = !s?.online
    ? '离线'
    : power > 0.1
    ? '供电(购电)'
    : power < -0.1
    ? '上网(售电)'
    : '待机';

  const powerColor = power > 0.1 ? '#f97316' : power < -0.1 ? '#34d399' : '#94a3b8';

  return (
    <div
      className={`device-node grid-node ${selected ? 'selected' : ''}`}
      onClick={data.onClick}
    >
      {/* Handles on all 4 sides for flexible wiring */}
      <Handle type="source" position={Position.Top}    id="top"    style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ top: '50%' }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ top: '50%' }} />
      <div className="node-header">
        <span className="node-icon">⚡</span>
        <span className="node-title">{data.label}</span>
        <span className={`node-status ${s?.online ? 'online' : 'offline'}`}>
          {s?.online ? '●' : '○'}
        </span>
      </div>
      <div className="node-body">
        <div className="node-row">
          <span>功率</span>
          <span style={{ color: powerColor }}>
            {power >= 0 ? '+' : ''}{power.toFixed(1)} kW
          </span>
        </div>
        <div className="node-row">
          <span>状态</span>
          <span>{statusText}</span>
        </div>
        <div className="node-row">
          <span>购电量</span>
          <span>{(s?.total_import_kwh ?? 0).toFixed(1)} kWh</span>
        </div>
        <div className="node-row">
          <span>售电量</span>
          <span>{(s?.total_export_kwh ?? 0).toFixed(1)} kWh</span>
        </div>
        {s?.frequency_hz !== undefined && (
          <div className="node-row">
            <span>频率</span>
            <span>{s.frequency_hz} Hz</span>
          </div>
        )}
      </div>
      <div className="node-type-badge">电网</div>
    </div>
  );
};

export default GridNode;
