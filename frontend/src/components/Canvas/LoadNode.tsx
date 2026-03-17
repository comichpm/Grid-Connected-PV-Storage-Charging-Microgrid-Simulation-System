import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { DeviceState } from '../../types';

interface LoadNodeData extends Record<string, unknown> {
  state?: DeviceState;
  label: string;
  onClick?: () => void;
}

type LoadNodeType = Node<LoadNodeData, 'load'>;

const MODE_LABELS: Record<string, string> = {
  constant: '恒定',
  daily_curve: '日曲线',
  random: '随机',
};

export const LoadNode: React.FC<NodeProps<LoadNodeType>> = ({ data, selected }) => {
  const s = data.state;
  const power = s?.power_kw ?? 0;

  return (
    <div
      className={`device-node load-node ${selected ? 'selected' : ''}`}
      onClick={data.onClick}
    >
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Left} id="left" />
      <div className="node-header">
        <span className="node-icon">💡</span>
        <span className="node-title">{data.label}</span>
        <span className={`node-status ${s?.online ? 'online' : 'offline'}`}>
          {s?.online ? '●' : '○'}
        </span>
      </div>
      <div className="node-body">
        <div className="node-row">
          <span>负荷功率</span>
          <span className="value-orange">{power.toFixed(1)} kW</span>
        </div>
        <div className="node-row">
          <span>负荷模式</span>
          <span>{MODE_LABELS[s?.load_mode ?? 'daily_curve'] ?? s?.load_mode}</span>
        </div>
        <div className="node-row">
          <span>调节比例</span>
          <span>{((s?.load_adjust_ratio ?? 1) * 100).toFixed(0)}%</span>
        </div>
        <div className="node-row">
          <span>日用电量</span>
          <span>{(s?.daily_energy_kwh ?? 0).toFixed(2)} kWh</span>
        </div>
      </div>
      <div className="node-type-badge">负荷</div>
    </div>
  );
};

export default LoadNode;
