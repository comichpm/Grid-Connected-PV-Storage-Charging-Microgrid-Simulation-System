import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { DeviceState } from '../../types';

interface BESSNodeData extends Record<string, unknown> {
  state?: DeviceState;
  label: string;
  onClick?: () => void;
}

type BESSNodeType = Node<BESSNodeData, 'bess'>;

const MODE_LABELS: Record<number, string> = { 0: '待机', 1: '充电', 2: '放电' };
const MODE_COLORS: Record<number, string> = {
  0: '#888',
  1: '#2196F3',
  2: '#FF9800',
};

export const BESSNode: React.FC<NodeProps<BESSNodeType>> = ({ data, selected }) => {
  const s = data.state;
  const soc = s?.soc ?? 0;
  const mode = s?.control_mode ?? 0;
  const power = s?.power_kw ?? 0;

  return (
    <div
      className={`device-node bess-node ${selected ? 'selected' : ''}`}
      onClick={data.onClick}
    >
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Left} id="left" />
      <div className="node-header">
        <span className="node-icon">🔋</span>
        <span className="node-title">{data.label}</span>
        <span className={`node-status ${s?.online ? 'online' : 'offline'}`}>
          {s?.online ? '●' : '○'}
        </span>
      </div>
      <div className="node-body">
        <div className="node-row">
          <span>功率</span>
          <span style={{ color: MODE_COLORS[mode] }}>
            {power >= 0 ? '+' : ''}{power.toFixed(1)} kW
          </span>
        </div>
        <div className="node-row">
          <span>SOC</span>
          <span>{soc.toFixed(1)}%</span>
        </div>
        <div className="soc-bar">
          <div
            className="soc-fill"
            style={{
              width: `${soc}%`,
              backgroundColor:
                soc < 20 ? '#f44336' : soc < 50 ? '#FF9800' : '#4CAF50',
            }}
          />
        </div>
        <div className="node-row">
          <span>模式</span>
          <span style={{ color: MODE_COLORS[mode] }}>{MODE_LABELS[mode]}</span>
        </div>
        <div className="node-row">
          <span>温度</span>
          <span>{(s?.battery_temp_c ?? 25).toFixed(1)} °C</span>
        </div>
      </div>
      <div className="node-type-badge">储能</div>
    </div>
  );
};

export default BESSNode;
