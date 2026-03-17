import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { DeviceState } from '../../types';

interface EVChargerNodeData extends Record<string, unknown> {
  state?: DeviceState;
  label: string;
  onClick?: () => void;
}

type EVChargerNodeType = Node<EVChargerNodeData, 'ev_charger'>;

const CHARGE_STATUS: Record<number, string> = {
  0: '空闲',
  1: '已连接',
  2: '充电中',
  3: '已满',
  4: '故障',
};

export const EVChargerNode: React.FC<NodeProps<EVChargerNodeType>> = ({ data, selected }) => {
  const s = data.state;
  const power = s?.power_kw ?? 0;
  const status = s?.charge_status ?? 0;

  return (
    <div
      className={`device-node ev-node ${selected ? 'selected' : ''}`}
      onClick={data.onClick}
    >
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Left} id="left" />
      <div className="node-header">
        <span className="node-icon">🔌</span>
        <span className="node-title">{data.label}</span>
        <span className={`node-status ${s?.online ? 'online' : 'offline'}`}>
          {s?.online ? '●' : '○'}
        </span>
      </div>
      <div className="node-body">
        <div className="node-row">
          <span>充电功率</span>
          <span className="value-blue">{power.toFixed(1)} kW</span>
        </div>
        <div className="node-row">
          <span>枪状态</span>
          <span>{s?.gun_connected ? '✅ 已连接' : '❌ 未连接'}</span>
        </div>
        <div className="node-row">
          <span>充电状态</span>
          <span>{CHARGE_STATUS[status] ?? '未知'}</span>
        </div>
        {s?.gun_connected && (
          <>
            <div className="node-row">
              <span>车辆SOC</span>
              <span>{(s.vehicle_soc ?? 0).toFixed(1)}%</span>
            </div>
            <div className="soc-bar">
              <div
                className="soc-fill"
                style={{
                  width: `${s.vehicle_soc ?? 0}%`,
                  backgroundColor: '#2196F3',
                }}
              />
            </div>
          </>
        )}
        <div className="node-row">
          <span>本次电量</span>
          <span>{(s?.session_energy_kwh ?? 0).toFixed(2)} kWh</span>
        </div>
      </div>
      <div className="node-type-badge">充电桩</div>
    </div>
  );
};

export default EVChargerNode;
