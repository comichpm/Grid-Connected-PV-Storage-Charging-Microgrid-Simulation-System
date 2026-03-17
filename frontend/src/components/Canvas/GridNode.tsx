import React from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import type { DeviceState } from '../../types';
import { NodeHandles } from './NodeHandles';
import { ProtocolBadge, type ProtocolInfo } from './ProtocolBadge';

interface GridNodeData extends Record<string, unknown> {
  state?: DeviceState;
  label: string;
  onClick?: () => void;
}

type GridNodeType = Node<GridNodeData & ProtocolInfo, 'grid'>;

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
      {/* 12 handles at 25%/50%/75% on all 4 edges for free-form connections */}
      <NodeHandles />
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
      <ProtocolBadge
        modbusPort={data.modbusPort}
        modbusSlave={data.modbusSlave}
        modbusMode={data.modbusMode as string | undefined}
        modbusSerial={data.modbusSerial as string | undefined}
        modbusBaud={data.modbusBaud as number | undefined}
        modbusParity={data.modbusParity as string | undefined}
      />
      <div className="node-type-badge">电网</div>
    </div>
  );
};

export default GridNode;
