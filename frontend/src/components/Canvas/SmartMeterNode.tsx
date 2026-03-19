import React from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import type { DeviceState } from '../../types';
import { NodeHandles } from './NodeHandles';
import { ProtocolBadge, type ProtocolInfo } from './ProtocolBadge';

interface SmartMeterNodeData extends Record<string, unknown> {
  label: string;
  deviceId: string;
  state?: DeviceState;
  onClick?: () => void;
}

type SmartMeterNodeType = Node<SmartMeterNodeData & ProtocolInfo, 'smart_meter'>;

export const SmartMeterNode: React.FC<NodeProps<SmartMeterNodeType>> = ({ data, selected }) => {
  const s = data.state;
  const activekw = s?.total_active_kw ?? 0;
  const reactivekvar = s?.total_reactive_kvar ?? 0;
  const pf = s?.power_factor ?? 1;
  const isOnline = s?.online !== false;
  const count = s?.monitored_count ?? 0;
  const monitorMode = (s as Record<string, unknown>)?.monitor_mode ?? '全部';

  const powerColor = activekw > 0.1 ? '#f97316' : activekw < -0.1 ? '#34d399' : '#94a3b8';

  return (
    <div
      className={`device-node smart-meter-node ${selected ? 'selected' : ''} ${!isOnline ? 'offline' : ''}`}
      onClick={data.onClick}
    >
      <NodeHandles />
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
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{monitorMode as string}({count}台)</span>
        </div>
      </div>
      <ProtocolBadge
        modbusPort={data.modbusPort}
        modbusSlave={data.modbusSlave}
        modbusMode={data.modbusMode as string | undefined}
        modbusSerial={data.modbusSerial as string | undefined}
        modbusBaud={data.modbusBaud as number | undefined}
        modbusParity={data.modbusParity as string | undefined}
      />
      <div className="node-type-badge">仪表</div>
    </div>
  );
};

export default SmartMeterNode;
