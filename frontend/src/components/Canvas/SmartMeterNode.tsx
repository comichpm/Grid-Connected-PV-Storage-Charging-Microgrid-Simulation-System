import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { DeviceState } from '../../types';

interface SmartMeterNodeData {
  label: string;
  deviceId: string;
  state?: DeviceState;
}

interface SmartMeterNodeProps {
  data: SmartMeterNodeData;
  selected: boolean;
}

export const SmartMeterNode: React.FC<SmartMeterNodeProps> = ({ data, selected }) => {
  const s = data.state;
  const activekw = s?.total_active_kw ?? 0;
  const pf = s?.power_factor ?? 1;
  const isOnline = s?.online !== false;
  const count = s?.monitored_count ?? 0;

  const powerColor = activekw > 0 ? '#f97316' : activekw < 0 ? '#34d399' : '#94a3b8';

  return (
    <div className={`device-node smart-meter-node ${selected ? 'selected' : ''} ${!isOnline ? 'offline' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <div className="node-icon">📊</div>
      <div className="node-label">{data.label}</div>
      {s && (
        <div className="node-status">
          <div className="node-status-row" style={{ color: powerColor }}>
            P: {activekw.toFixed(1)} kW
          </div>
          <div className="node-status-row">
            PF: {pf.toFixed(3)}
          </div>
          <div className="node-status-row" style={{ fontSize: '10px', color: '#94a3b8' }}>
            监控 {count} 设备
          </div>
          {!isOnline && <div className="node-offline-badge">离线</div>}
        </div>
      )}
    </div>
  );
};

export default SmartMeterNode;
