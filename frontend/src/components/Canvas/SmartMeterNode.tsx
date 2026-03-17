import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { DeviceState } from '../../types';

interface SmartMeterNodeData extends Record<string, unknown> {
  label: string;
  deviceId: string;
  state?: DeviceState;
  onClick?: () => void;
}

type SmartMeterNodeType = Node<SmartMeterNodeData, 'smart_meter'>;

export const SmartMeterNode: React.FC<NodeProps<SmartMeterNodeType>> = ({ data, selected }) => {
  const s = data.state;
  const activekw = s?.total_active_kw ?? 0;
  const reactivekvar = s?.total_reactive_kvar ?? 0;
  const pf = s?.power_factor ?? 1;
  const isOnline = s?.online !== false;
  const count = s?.monitored_count ?? 0;
  const monitorMode = (s as any)?.monitor_mode ?? '全部';

  const powerColor = activekw > 0.1 ? '#f97316' : activekw < -0.1 ? '#34d399' : '#94a3b8';

  return (
    <div
      className={`device-node smart-meter-node ${selected ? 'selected' : ''} ${!isOnline ? 'offline' : ''}`}
      onClick={data.onClick}
    >
      {/* Handles on all 4 sides */}
      <Handle type="source" position={Position.Top}    id="top"    style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ top: '50%' }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ top: '50%' }} />
      <div className="node-header">
        <span className="node-icon">📊</span>
        <span className="node-title">{data.label}</span>
        <span className={`node-status ${isOnline ? 'online' : 'offline'}`}>
          {isOnline ? '●' : '○'}
        </span>
      </div>
      <div className="node-body">
        <div className="node-row">
          <span>总有功</span>
          <span style={{ color: powerColor }}>{activekw.toFixed(2)} kW</span>
        </div>
        {Math.abs(reactivekvar) > 0.01 && (
          <div className="node-row">
            <span>总无功</span>
            <span className="value-purple">{reactivekvar.toFixed(2)} kvar</span>
          </div>
        )}
        <div className="node-row">
          <span>功率因数</span>
          <span>{pf.toFixed(3)}</span>
        </div>
        <div className="node-row">
          <span>监测模式</span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{monitorMode}({count}设备)</span>
        </div>
      </div>
      <div className="node-type-badge">仪表</div>
    </div>
  );
};

export default SmartMeterNode;
