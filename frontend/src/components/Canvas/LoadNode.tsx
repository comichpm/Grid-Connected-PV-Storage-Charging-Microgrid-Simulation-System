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
  constant:    '恒定功率',
  daily_curve: '日负荷曲线',
  random:      '随机波动',
  inductive:   '感性负荷',
  capacitive:  '容性负荷',
  impulse:     '冲击负荷',
  motor_start: '电机起动',
};

export const LoadNode: React.FC<NodeProps<LoadNodeType>> = ({ data, selected }) => {
  const s = data.state;
  const power = s?.power_kw ?? 0;
  const reactive = s?.reactive_power_kvar ?? 0;
  const pf = s?.power_factor ?? 1;
  const mode = s?.load_mode ?? 'daily_curve';
  const hasReactive = Math.abs(reactive) > 0.01;

  return (
    <div
      className={`device-node load-node ${selected ? 'selected' : ''}`}
      onClick={data.onClick}
    >
      {/* Handles on all 4 sides */}
      <Handle type="source" position={Position.Top}    id="top"    style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ top: '50%' }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ top: '50%' }} />
      <div className="node-header">
        <span className="node-icon">💡</span>
        <span className="node-title">{data.label}</span>
        <span className={`node-status ${s?.online ? 'online' : 'offline'}`}>
          {s?.online ? '●' : '○'}
        </span>
      </div>
      <div className="node-body">
        <div className="node-row">
          <span>有功功率</span>
          <span className="value-orange">{power.toFixed(1)} kW</span>
        </div>
        {hasReactive && (
          <div className="node-row">
            <span>无功功率</span>
            <span className="value-purple">{reactive.toFixed(1)} kvar</span>
          </div>
        )}
        {hasReactive && (
          <div className="node-row">
            <span>功率因数</span>
            <span>{pf.toFixed(3)}</span>
          </div>
        )}
        <div className="node-row">
          <span>负荷模式</span>
          <span>{MODE_LABELS[mode] ?? mode}</span>
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
