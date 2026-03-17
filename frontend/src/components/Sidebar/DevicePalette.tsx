import React from 'react';
import type { DeviceType } from '../../types';

interface DeviceTemplate {
  type: DeviceType;
  label: string;
  icon: string;
  description: string;
}

const DEVICE_TEMPLATES: DeviceTemplate[] = [
  {
    type: 'grid',
    label: '电网并网点',
    icon: '⚡',
    description: 'Slack Bus，自动平衡功率',
  },
  {
    type: 'pv',
    label: '光伏逆变器',
    icon: '☀️',
    description: '根据辐照度生成功率',
  },
  {
    type: 'bess',
    label: '储能系统',
    icon: '🔋',
    description: 'SOC跟随充放电变化',
  },
  {
    type: 'ev_charger',
    label: '电动汽车充电桩',
    icon: '🔌',
    description: 'CC-CV充电模拟',
  },
  {
    type: 'load',
    label: '负荷',
    icon: '💡',
    description: '支持恒定/日曲线/随机模式',
  },
];

export const DevicePalette: React.FC = () => {
  const onDragStart = (event: React.DragEvent, template: DeviceTemplate) => {
    event.dataTransfer.setData('application/deviceType', template.type);
    event.dataTransfer.setData('application/deviceName', template.label);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="device-palette">
      <div className="palette-title">设备列表</div>
      <div className="palette-hint">拖拽设备到画布</div>
      {DEVICE_TEMPLATES.map((tpl) => (
        <div
          key={tpl.type}
          className="palette-item"
          draggable
          onDragStart={(e) => onDragStart(e, tpl)}
        >
          <span className="palette-icon">{tpl.icon}</span>
          <div className="palette-info">
            <div className="palette-label">{tpl.label}</div>
            <div className="palette-desc">{tpl.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DevicePalette;
