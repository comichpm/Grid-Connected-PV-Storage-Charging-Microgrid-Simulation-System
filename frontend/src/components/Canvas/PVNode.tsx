import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { DeviceState } from '../../types';

interface PVNodeData extends Record<string, unknown> {
  state?: DeviceState;
  label: string;
  onClick?: () => void;
}

type PVNodeType = Node<PVNodeData, 'pv'>;

const WEATHER_LABELS: Record<string, string> = {
  sunny:         '☀️ 晴天',
  partly_cloudy: '⛅ 多云',
  cloudy:        '☁️ 阴天',
  rainy:         '🌧️ 雨天',
  snowy:         '❄️ 雪天',
  foggy:         '🌫️ 雾天',
  custom:        '🔧 自定义',
};

export const PVNode: React.FC<NodeProps<PVNodeType>> = ({ data, selected }) => {
  const s = data.state;
  const power = Math.abs(s?.power_kw ?? 0);
  const weather = s?.weather_mode ?? 'sunny';

  return (
    <div
      className={`device-node pv-node ${selected ? 'selected' : ''}`}
      onClick={data.onClick}
    >
      {/* Handles on all 4 sides */}
      <Handle type="source" position={Position.Top}    id="top"    style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ top: '50%' }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ top: '50%' }} />
      <div className="node-header">
        <span className="node-icon">☀️</span>
        <span className="node-title">{data.label}</span>
        <span className={`node-status ${s?.online ? 'online' : 'offline'}`}>
          {s?.online ? '●' : '○'}
        </span>
      </div>
      <div className="node-body">
        <div className="node-row">
          <span>发电功率</span>
          <span className="value-green">{power.toFixed(1)} kW</span>
        </div>
        <div className="node-row">
          <span>天气</span>
          <span>{WEATHER_LABELS[weather] ?? weather}</span>
        </div>
        <div className="node-row">
          <span>辐照度</span>
          <span>{(s?.irradiance_wm2 ?? 0).toFixed(0)} W/m²</span>
        </div>
        <div className="node-row">
          <span>日发电量</span>
          <span>{(s?.daily_energy_kwh ?? 0).toFixed(2)} kWh</span>
        </div>
      </div>
      <div className="node-type-badge">光伏</div>
    </div>
  );
};

export default PVNode;
