import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { DeviceState } from '../../types';

interface PVNodeProps {
  data: {
    state?: DeviceState;
    label: string;
    onClick?: () => void;
  };
  selected?: boolean;
}

export const PVNode: React.FC<PVNodeProps> = ({ data, selected }) => {
  const s = data.state;
  const power = Math.abs(s?.power_kw ?? 0);

  return (
    <div
      className={`device-node pv-node ${selected ? 'selected' : ''}`}
      onClick={data.onClick}
    >
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Left} id="left" />
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
          <span>辐照度</span>
          <span>{(s?.irradiance_wm2 ?? 0).toFixed(0)} W/m²</span>
        </div>
        <div className="node-row">
          <span>电池温度</span>
          <span>{(s?.cell_temp_c ?? 25).toFixed(1)} °C</span>
        </div>
        <div className="node-row">
          <span>日发电量</span>
          <span>{(s?.daily_energy_kwh ?? 0).toFixed(2)} kWh</span>
        </div>
        <div className="node-row">
          <span>限功率</span>
          <span>{((s?.power_limit_ratio ?? 1) * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="node-type-badge">光伏</div>
    </div>
  );
};

export default PVNode;
