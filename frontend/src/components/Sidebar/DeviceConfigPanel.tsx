import React, { useState } from 'react';
import type { DeviceInfo } from '../../types';
import { updateDevice, controlDevice } from '../../services/api';

interface DeviceConfigPanelProps {
  device: DeviceInfo | null;
  onClose: () => void;
  onUpdate: () => void;
}

export const DeviceConfigPanel: React.FC<DeviceConfigPanelProps> = ({
  device,
  onClose,
  onUpdate,
}) => {
  const [editConfig, setEditConfig] = useState<Record<string, unknown>>({});
  const [modbusPart, setModbusPart] = useState({ port: 5020, slaveId: 1 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  React.useEffect(() => {
    if (device) {
      setEditConfig({ ...device.config });
      setModbusPart({
        port: device.modbus_port,
        slaveId: device.modbus_slave_id,
      });
    }
  }, [device]);

  if (!device) return null;

  const handleConfigChange = (key: string, value: string | number | boolean) => {
    setEditConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDevice(device.id, {
        config: editConfig,
        modbus_port: modbusPart.port,
        modbus_slave_id: modbusPart.slaveId,
      });
      setMessage('保存成功 ✓');
      onUpdate();
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setMessage('保存失败 ✗');
    } finally {
      setSaving(false);
    }
  };

  const handleControl = async (action: string, extra?: Record<string, unknown>) => {
    try {
      await controlDevice(device.id, { action, ...extra });
      onUpdate();
      setMessage(`操作成功: ${action}`);
      setTimeout(() => setMessage(''), 2000);
    } catch {
      setMessage('操作失败');
    }
  };

  const renderControls = () => {
    const s = device.state;
    switch (device.device_type) {
      case 'bess':
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button
                className="ctrl-btn"
                onClick={() => handleControl(s?.online ? 'offline' : 'online')}
              >
                {s?.online ? '关机' : '开机'}
              </button>
              <button
                className="ctrl-btn blue"
                onClick={() => handleControl('set_param', { param: 'control_mode', value: 1 })}
              >
                充电
              </button>
              <button
                className="ctrl-btn orange"
                onClick={() => handleControl('set_param', { param: 'control_mode', value: 2 })}
              >
                放电
              </button>
              <button
                className="ctrl-btn gray"
                onClick={() => handleControl('set_param', { param: 'control_mode', value: 0 })}
              >
                待机
              </button>
            </div>
            <div className="input-row">
              <label>功率设定值 (kW)</label>
              <input
                type="number"
                defaultValue={s?.power_setpoint_kw ?? 0}
                onBlur={(e) =>
                  handleControl('set_param', {
                    param: 'power_setpoint_kw',
                    value: parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </div>
        );
      case 'pv':
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button
                className="ctrl-btn"
                onClick={() => handleControl(s?.online ? 'offline' : 'online')}
              >
                {s?.online ? '关机' : '开机'}
              </button>
            </div>
            <div className="input-row">
              <label>限功率比例 (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                defaultValue={(s?.power_limit_ratio ?? 1) * 100}
                onBlur={(e) =>
                  handleControl('set_param', {
                    param: 'power_limit_ratio',
                    value: parseFloat(e.target.value) / 100,
                  })
                }
              />
            </div>
          </div>
        );
      case 'load':
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button
                className="ctrl-btn"
                onClick={() => handleControl(s?.online ? 'offline' : 'online')}
              >
                {s?.online ? '断电' : '送电'}
              </button>
            </div>
            <div className="input-row">
              <label>负荷调节比例 (%)</label>
              <input
                type="number"
                min="0"
                max="200"
                defaultValue={(s?.load_adjust_ratio ?? 1) * 100}
                onBlur={(e) =>
                  handleControl('set_param', {
                    param: 'load_adjust_ratio',
                    value: parseFloat(e.target.value) / 100,
                  })
                }
              />
            </div>
          </div>
        );
      default:
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button
                className="ctrl-btn"
                onClick={() => handleControl(s?.online ? 'offline' : 'online')}
              >
                {s?.online ? '下线' : '上线'}
              </button>
            </div>
          </div>
        );
    }
  };

  const renderConfigFields = () => {
    const numericKeys = Object.entries(editConfig).filter(
      ([, v]) => typeof v === 'number'
    );
    const strKeys = Object.entries(editConfig).filter(
      ([, v]) => typeof v === 'string'
    );
    const boolKeys = Object.entries(editConfig).filter(
      ([, v]) => typeof v === 'boolean'
    );

    return (
      <div className="config-section">
        <div className="section-title">设备参数</div>
        {numericKeys.map(([key, val]) => (
          <div className="input-row" key={key}>
            <label>{key}</label>
            <input
              type="number"
              value={val as number}
              onChange={(e) => handleConfigChange(key, parseFloat(e.target.value))}
            />
          </div>
        ))}
        {strKeys.map(([key, val]) => (
          <div className="input-row" key={key}>
            <label>{key}</label>
            <input
              type="text"
              value={val as string}
              onChange={(e) => handleConfigChange(key, e.target.value)}
            />
          </div>
        ))}
        {boolKeys.map(([key, val]) => (
          <div className="input-row" key={key}>
            <label>{key}</label>
            <input
              type="checkbox"
              checked={val as boolean}
              onChange={(e) => handleConfigChange(key, e.target.checked)}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="config-panel">
      <div className="config-header">
        <span>{device.name}</span>
        <button className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="config-body">
        <div className="device-type-label">{device.device_type.toUpperCase()}</div>

        {/* Modbus settings */}
        <div className="config-section">
          <div className="section-title">Modbus TCP 通讯参数</div>
          <div className="input-row">
            <label>端口</label>
            <input
              type="number"
              value={modbusPart.port}
              onChange={(e) =>
                setModbusPart((p) => ({ ...p, port: parseInt(e.target.value, 10) }))
              }
            />
          </div>
          <div className="input-row">
            <label>从站地址</label>
            <input
              type="number"
              value={modbusPart.slaveId}
              onChange={(e) =>
                setModbusPart((p) => ({
                  ...p,
                  slaveId: parseInt(e.target.value, 10),
                }))
              }
            />
          </div>
        </div>

        {renderConfigFields()}
        {renderControls()}

        <div className="config-actions">
          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存参数'}
          </button>
          {message && <div className="message">{message}</div>}
        </div>
      </div>
    </div>
  );
};

export default DeviceConfigPanel;
