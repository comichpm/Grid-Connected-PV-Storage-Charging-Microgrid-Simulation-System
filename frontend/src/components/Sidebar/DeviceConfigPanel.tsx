import React, { useState, useEffect } from 'react';
import type { DeviceInfo, LoadMode, WeatherMode } from '../../types';
import { updateDevice, controlDevice } from '../../services/api';
import { RegisterTableModal } from './RegisterTableModal';

interface DeviceConfigPanelProps {
  device: DeviceInfo | null;
  onClose: () => void;
  onUpdate: () => void;
  deviceList?: DeviceInfo[];
}

// ---- Labels ----
const LOAD_MODE_LABELS: Record<LoadMode, string> = {
  constant:    '恒定功率',
  daily_curve: '日负荷曲线',
  random:      '随机波动',
  inductive:   '感性负荷（滞后功率因数）',
  capacitive:  '容性负荷（超前功率因数）',
  impulse:     '冲击负荷（周期性涌流）',
  motor_start: '电机起动（高涌流启动）',
};

const WEATHER_MODE_LABELS: Record<WeatherMode, string> = {
  sunny:         '☀️ 晴天（100%）',
  partly_cloudy: '⛅ 多云（65%）',
  cloudy:        '☁️ 阴天（30%）',
  rainy:         '🌧️ 雨天（15%）',
  snowy:         '❄️ 雪天（20%）',
  foggy:         '🌫️ 雾天（25%）',
  custom:        '🔧 自定义比例',
};

const GRID_STATUS_LABELS: Record<number, string> = {
  0: '离线', 1: '供电（购电）', 2: '上网（售电）', 3: '空载', 4: '过载跳闸',
};

// ---- Shared Modbus RTU config ----
const ModbusProtocolConfig: React.FC<{
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}> = ({ config, onChange }) => {
  const mode = (config.modbus_mode as string) || 'tcp';
  return (
    <div className="config-subsection">
      <div className="subsection-title">Modbus 协议</div>
      <div className="input-row">
        <label>协议类型</label>
        <select value={mode} onChange={e => onChange('modbus_mode', e.target.value)}>
          <option value="tcp">Modbus TCP</option>
          <option value="rtu">Modbus RTU (串口)</option>
        </select>
      </div>
      {mode === 'rtu' && (
        <>
          <div className="input-row">
            <label>串口</label>
            <input type="text" value={(config.modbus_serial_port as string) || '/dev/ttyUSB0'}
              onChange={e => onChange('modbus_serial_port', e.target.value)} placeholder="/dev/ttyUSB0" />
          </div>
          <div className="input-row">
            <label>波特率</label>
            <select value={(config.modbus_baud_rate as number) || 9600}
              onChange={e => onChange('modbus_baud_rate', parseInt(e.target.value, 10))}>
              {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="input-row">
            <label>校验位</label>
            <select value={(config.modbus_parity as string) || 'N'}
              onChange={e => onChange('modbus_parity', e.target.value)}>
              <option value="N">无校验</option>
              <option value="E">偶校验</option>
              <option value="O">奇校验</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
};

// ---- Main panel ----
export const DeviceConfigPanel: React.FC<DeviceConfigPanelProps> = ({
  device,
  onClose,
  onUpdate,
  deviceList = [],
}) => {
  const [editConfig, setEditConfig] = useState<Record<string, unknown>>({});
  const [modbusPart, setModbusPart] = useState({ port: 5020, slaveId: 1 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showRegisters, setShowRegisters] = useState(false);

  useEffect(() => {
    if (device) {
      setEditConfig({ ...device.config });
      setModbusPart({ port: device.modbus_port, slaveId: device.modbus_slave_id });
    }
  }, [device]);

  if (!device) return null;

  const handleConfigChange = (key: string, value: unknown) => {
    setEditConfig(prev => ({ ...prev, [key]: value }));
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
      setTimeout(() => setMessage(''), 2500);
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

  const s = device.state;

  // ---- Status display ----
  const renderStatus = () => {
    if (!s) return null;
    const rows: Array<[string, string]> = [];

    if (device.device_type === 'grid') {
      const pw = s.power_kw ?? 0;
      rows.push(['功率', `${pw >= 0 ? '+' : ''}${pw.toFixed(2)} kW  ${pw > 0.1 ? '(供电)' : pw < -0.1 ? '(上网)' : '(空载)'}`]);
      rows.push(['状态', GRID_STATUS_LABELS[s.grid_status ?? 3] ?? '']);
      rows.push(['总购电量', `${(s.total_import_kwh ?? 0).toFixed(1)} kWh`]);
      rows.push(['总售电量', `${(s.total_export_kwh ?? 0).toFixed(1)} kWh`]);
      if ((s.overload_count ?? 0) > 0) rows.push(['过载次数', String(s.overload_count)]);
    } else if (device.device_type === 'pv') {
      rows.push(['发电功率', `${Math.abs(s.power_kw ?? 0).toFixed(2)} kW`]);
      rows.push(['辐照度', `${(s.irradiance_wm2 ?? 0).toFixed(0)} W/m²`]);
      rows.push(['今日发电', `${(s.daily_energy_kwh ?? 0).toFixed(2)} kWh`]);
    } else if (device.device_type === 'load') {
      rows.push(['有功功率', `${(s.power_kw ?? 0).toFixed(2)} kW`]);
      if ((s.reactive_power_kvar ?? 0) !== 0)
        rows.push(['无功功率', `${(s.reactive_power_kvar ?? 0).toFixed(2)} kvar`]);
      if ((s.apparent_power_kva ?? 0) !== 0)
        rows.push(['视在功率', `${(s.apparent_power_kva ?? 0).toFixed(2)} kVA`]);
      rows.push(['今日耗电', `${(s.daily_energy_kwh ?? 0).toFixed(2)} kWh`]);
    } else if (device.device_type === 'smart_meter') {
      rows.push(['总有功功率', `${(s.total_active_kw ?? 0).toFixed(2)} kW`]);
      rows.push(['总无功功率', `${(s.total_reactive_kvar ?? 0).toFixed(2)} kvar`]);
      rows.push(['功率因数', (s.power_factor ?? 1).toFixed(3)]);
      rows.push(['总计取电', `${(s.total_import_kwh ?? 0).toFixed(1)} kWh`]);
      rows.push(['总计送电', `${(s.total_export_kwh ?? 0).toFixed(1)} kWh`]);
      const monMode = (s as Record<string, unknown>).monitor_mode ?? '全部';
      rows.push(['监测模式', `${monMode}（${s.monitored_count ?? 0} 设备）`]);
    } else if (device.device_type === 'bess') {
      rows.push(['功率', `${(s.power_kw ?? 0).toFixed(2)} kW`]);
      rows.push(['SOC', `${(s.soc ?? 0).toFixed(1)} %`]);
    }

    if (rows.length === 0) return null;
    return (
      <div className="status-section">
        <div className="section-title">实时状态</div>
        {rows.map(([k, v]) => (
          <div className="status-row" key={k}>
            <span className="status-key">{k}</span>
            <span className="status-val">{v}</span>
          </div>
        ))}
      </div>
    );
  };

  // ---- Config sections ----
  const renderGridConfig = () => (
    <>
      <div className="config-subsection">
        <div className="subsection-title">基本参数</div>
        <NumInput label="额定容量 (kW)" ckey="rated_capacity_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="最大购电功率 (kW)" ckey="max_import_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="最大售电功率 (kW)" ckey="max_export_kw" cfg={editConfig} onChange={handleConfigChange} />
      </div>
      <div className="config-subsection">
        <div className="subsection-title">过载保护</div>
        <NumInput label="过载倍数阈值 (如 1.2=120%)" ckey="overload_threshold_ratio" cfg={editConfig} onChange={handleConfigChange} step={0.1} />
        <NumInput label="允许持续时间 (s)" ckey="overload_max_duration_s" cfg={editConfig} onChange={handleConfigChange} />
        <div className="input-row">
          <label>超时后自动断网</label>
          <input type="checkbox" checked={(editConfig.disconnect_on_overload as boolean) ?? true}
            onChange={e => handleConfigChange('disconnect_on_overload', e.target.checked)} />
        </div>
      </div>
      <ModbusProtocolConfig config={editConfig} onChange={handleConfigChange} />
    </>
  );

  const renderPVConfig = () => {
    const weather = (editConfig.weather_mode as string) || 'sunny';
    const ratePow = (editConfig.rated_power_kw as number) || 100;
    // Estimate peak output for user guidance
    const peakEst = ratePow;
    const weatherFactor: Record<string, number> = {
      sunny: 1.0, partly_cloudy: 0.65, cloudy: 0.3, rainy: 0.15,
      snowy: 0.2, foggy: 0.25, custom: (editConfig.custom_irr_factor as number) || 1.0,
    };
    const estPow = (peakEst * (weatherFactor[weather] || 1.0)).toFixed(1);
    return (
      <>
        <div className="config-subsection">
          <div className="subsection-title">基本参数</div>
          <NumInput label="额定功率 (kW) — 晴天正午最大输出" ckey="rated_power_kw" cfg={editConfig} onChange={handleConfigChange} />
          <div className="input-row">
            <label>当前天气</label>
            <select value={weather} onChange={e => handleConfigChange('weather_mode', e.target.value)}>
              {(Object.entries(WEATHER_MODE_LABELS) as [WeatherMode, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          {weather === 'custom' && (
            <NumInput label="自定义辐照比例 (0.0~1.5)" ckey="custom_irr_factor" cfg={editConfig} onChange={handleConfigChange} step={0.05} min={0} max={1.5} />
          )}
          <div className="hint-text">⚡ 当前天气预计峰值输出：约 {estPow} kW</div>
        </div>
        <ModbusProtocolConfig config={editConfig} onChange={handleConfigChange} />
      </>
    );
  };

  const renderLoadConfig = () => {
    const mode = (editConfig.load_mode as string) || 'daily_curve';
    const rated = (editConfig.rated_power_kw as number) || 50;
    const baseRatio = (editConfig.base_load_ratio as number) ?? 1.0;
    const adjustRatio = (editConfig.load_adjust_ratio as number) ?? 1.0;
    // Compute expected power for user guidance (constant/inductive/capacitive modes)
    const constModes = ['constant', 'inductive', 'capacitive'];
    const estPow = constModes.includes(mode)
      ? (rated * baseRatio * adjustRatio).toFixed(1)
      : `${(rated * 0.2 * adjustRatio).toFixed(1)} ~ ${(rated * adjustRatio).toFixed(1)}`;

    return (
      <>
        <div className="config-subsection">
          <div className="subsection-title">基本参数</div>
          <NumInput label="额定功率 (kW) — 负荷最大消耗功率" ckey="rated_power_kw" cfg={editConfig} onChange={handleConfigChange} />
          <div className="input-row">
            <label>负荷模式</label>
            <select value={mode} onChange={e => handleConfigChange('load_mode', e.target.value)}>
              {(Object.entries(LOAD_MODE_LABELS) as [LoadMode, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* For constant/inductive/capacitive: base_load_ratio is the operating level */}
          {['constant', 'inductive', 'capacitive'].includes(mode) && (
            <NumInput label="运行功率比例 (0~1.0, 1.0=满额定)" ckey="base_load_ratio" cfg={editConfig}
              onChange={handleConfigChange} step={0.05} min={0} max={1} />
          )}

          <div className="hint-text">
            ⚡ 预计功率：{estPow} kW
            {['constant', 'inductive', 'capacitive'].includes(mode) &&
              <span>  （额定{rated} × 比例{(baseRatio*100).toFixed(0)}% × 调节{(adjustRatio*100).toFixed(0)}%）</span>
            }
          </div>
        </div>

        {/* Reactive power modes */}
        {(mode === 'inductive' || mode === 'capacitive') && (
          <div className="config-subsection">
            <div className="subsection-title">功率因数</div>
            <NumInput label="功率因数 (0.1~1.0)" ckey="power_factor" cfg={editConfig} onChange={handleConfigChange} step={0.01} min={0.1} max={1.0} />
            <div className="hint-text">
              {mode === 'inductive' ? '感性负荷产生滞后无功 (Q>0)，如电机、变压器' : '容性负荷产生超前无功 (Q<0)，如电容补偿'}
            </div>
          </div>
        )}

        {/* Impulse settings */}
        {mode === 'impulse' && (
          <div className="config-subsection">
            <div className="subsection-title">冲击负荷参数</div>
            <NumInput label="冲击间隔 (s)" ckey="impulse_interval_s" cfg={editConfig} onChange={handleConfigChange} />
            <NumInput label="冲击持续时间 (s)" ckey="impulse_duration_s" cfg={editConfig} onChange={handleConfigChange} />
            <NumInput label="峰值功率倍数 (如 3=3×额定)" ckey="impulse_peak_ratio" cfg={editConfig} onChange={handleConfigChange} step={0.5} />
            <div className="hint-text">
              每隔{(editConfig.impulse_interval_s as number)||60}s 产生 {(editConfig.impulse_duration_s as number)||5}s 的 {(editConfig.impulse_peak_ratio as number)||3}倍涌流
            </div>
          </div>
        )}

        {/* Motor start settings */}
        {mode === 'motor_start' && (
          <div className="config-subsection">
            <div className="subsection-title">电机起动参数</div>
            <NumInput label="起动涌流倍数 (如 6=6×额定)" ckey="motor_start_peak_ratio" cfg={editConfig} onChange={handleConfigChange} step={0.5} />
            <NumInput label="起动持续时间 (s)" ckey="motor_start_duration_s" cfg={editConfig} onChange={handleConfigChange} step={0.5} />
            <NumInput label="起动间隔 (s)" ckey="motor_start_interval_s" cfg={editConfig} onChange={handleConfigChange} />
            <div className="hint-text">
              起动时电流为额定的{(editConfig.motor_start_peak_ratio as number)||6}倍，持续{(editConfig.motor_start_duration_s as number)||3}s后衰减到正常
            </div>
          </div>
        )}

        <ModbusProtocolConfig config={editConfig} onChange={handleConfigChange} />
      </>
    );
  };

  const renderSmartMeterConfig = () => {
    const monitored = (editConfig.monitored_device_ids as string[]) || [];
    const otherDevices = (deviceList as DeviceInfo[]).filter((d: DeviceInfo) => d.id !== device.id && d.device_type !== 'smart_meter');
    const isAutoMode = monitored.length === 0;

    const toggleDevice = (id: string) => {
      if (monitored.includes(id)) {
        handleConfigChange('monitored_device_ids', monitored.filter(x => x !== id));
      } else {
        handleConfigChange('monitored_device_ids', [...monitored, id]);
      }
    };

    return (
      <>
        <div className="config-subsection">
          <div className="subsection-title">监测设备</div>
          <div className="hint-text" style={{ marginBottom: 8 }}>
            {isAutoMode
              ? '✅ 当前模式：自动监测所有设备（列表为空时自动监测全部）'
              : `✅ 当前模式：仅监测已勾选的 ${monitored.length} 个设备`}
          </div>
          {otherDevices.length === 0 ? (
            <div className="hint-text">请先在画布上添加其他设备</div>
          ) : (
            otherDevices.map(d => (
              <div className="input-row" key={d.id}>
                <label>{d.name}（{d.device_type}）</label>
                <input type="checkbox" checked={monitored.includes(d.id)}
                  onChange={() => toggleDevice(d.id)} />
              </div>
            ))
          )}
          {monitored.length > 0 && (
            <button className="ctrl-btn gray" style={{ marginTop: 6 }}
              onClick={() => handleConfigChange('monitored_device_ids', [])}>
              清空选择（恢复自动监测全部）
            </button>
          )}
        </div>
        <ModbusProtocolConfig config={editConfig} onChange={handleConfigChange} />
      </>
    );
  };

  const renderBESSConfig = () => (
    <>
      <div className="config-subsection">
        <div className="subsection-title">储能参数</div>
        <NumInput label="额定功率 (kW)" ckey="rated_power_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="容量 (kWh)" ckey="capacity_kwh" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="最小SOC (%)" ckey="min_soc" cfg={editConfig} onChange={handleConfigChange} min={0} max={50} />
        <NumInput label="最大SOC (%)" ckey="max_soc" cfg={editConfig} onChange={handleConfigChange} min={50} max={100} />
      </div>
    </>
  );

  const renderEVConfig = () => (
    <>
      <div className="config-subsection">
        <div className="subsection-title">充电桩参数</div>
        <NumInput label="额定功率 (kW)" ckey="rated_power_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="车辆电池容量 (kWh)" ckey="vehicle_battery_kwh" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="初始SOC (%)" ckey="initial_vehicle_soc" cfg={editConfig} onChange={handleConfigChange} min={0} max={100} />
        <NumInput label="目标SOC (%)" ckey="target_vehicle_soc" cfg={editConfig} onChange={handleConfigChange} min={0} max={100} />
      </div>
    </>
  );

  const renderConfigFields = () => {
    switch (device.device_type) {
      case 'grid':        return renderGridConfig();
      case 'pv':          return renderPVConfig();
      case 'load':        return renderLoadConfig();
      case 'bess':        return renderBESSConfig();
      case 'ev_charger':  return renderEVConfig();
      case 'smart_meter': return renderSmartMeterConfig();
      default: return null;
    }
  };

  // ---- Controls ----
  const renderControls = () => {
    switch (device.device_type) {
      case 'bess':
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button className="ctrl-btn" onClick={() => handleControl(s?.online ? 'offline' : 'online')}>
                {s?.online ? '关机' : '开机'}
              </button>
              <button className="ctrl-btn blue"   onClick={() => handleControl('set_param', { param: 'control_mode', value: 1 })}>充电</button>
              <button className="ctrl-btn orange"  onClick={() => handleControl('set_param', { param: 'control_mode', value: 2 })}>放电</button>
              <button className="ctrl-btn gray"    onClick={() => handleControl('set_param', { param: 'control_mode', value: 0 })}>待机</button>
            </div>
            <div className="input-row">
              <label>功率设定 (kW)</label>
              <input type="number" defaultValue={s?.power_setpoint_kw ?? 0}
                onBlur={e => handleControl('set_param', { param: 'power_setpoint_kw', value: parseFloat(e.target.value) })} />
            </div>
          </div>
        );
      case 'pv':
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button className="ctrl-btn" onClick={() => handleControl(s?.online ? 'offline' : 'online')}>
                {s?.online ? '关机' : '开机'}
              </button>
            </div>
            <div className="input-row">
              <label>限功率比例 (%)</label>
              <input type="number" min="0" max="100" defaultValue={(s?.power_limit_ratio ?? 1) * 100}
                onBlur={e => handleControl('set_param', { param: 'power_limit_ratio', value: parseFloat(e.target.value) / 100 })} />
            </div>
          </div>
        );
      case 'load':
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button className="ctrl-btn" onClick={() => handleControl(s?.online ? 'offline' : 'online')}>
                {s?.online ? '断电' : '送电'}
              </button>
            </div>
            <div className="input-row">
              <label>临时调节倍率 (%，100=正常)</label>
              <input type="number" min="0" max="200" defaultValue={(s?.load_adjust_ratio ?? 1) * 100}
                onBlur={e => handleControl('set_param', { param: 'load_adjust_ratio', value: parseFloat(e.target.value) / 100 })} />
            </div>
          </div>
        );
      case 'grid':
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button className="ctrl-btn" onClick={() => handleControl(s?.online ? 'offline' : 'online')}>
                {s?.online ? '断网' : '并网'}
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="control-section">
            <div className="section-title">控制操作</div>
            <div className="control-row">
              <button className="ctrl-btn" onClick={() => handleControl(s?.online ? 'offline' : 'online')}>
                {s?.online ? '下线' : '上线'}
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="config-panel">
      {showRegisters && (
        <RegisterTableModal
          deviceId={device.id}
          deviceName={device.name}
          onClose={() => setShowRegisters(false)}
        />
      )}
      <div className="config-header">
        <span>{device.name}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            className="ctrl-btn"
            title="查看完整通讯协议点表"
            onClick={() => setShowRegisters(true)}
            style={{ fontSize: 11, padding: '2px 7px' }}
          >
            📋 点表
          </button>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="config-body">
        <div className="device-type-label">{device.device_type.toUpperCase()}</div>

        {renderStatus()}

        {/* Modbus TCP address */}
        <div className="config-section">
          <div className="section-title">Modbus 地址</div>
          <div className="input-row">
            <label>TCP 端口</label>
            <input type="number" value={modbusPart.port}
              onChange={e => setModbusPart(p => ({ ...p, port: parseInt(e.target.value, 10) }))} />
          </div>
          <div className="input-row">
            <label>从站地址</label>
            <input type="number" value={modbusPart.slaveId}
              onChange={e => setModbusPart(p => ({ ...p, slaveId: parseInt(e.target.value, 10) }))} />
          </div>
        </div>

        <div className="config-section">
          {renderConfigFields()}
        </div>

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

// ---- Helper: numeric input ----
interface NumInputProps {
  label: string;
  ckey: string;
  cfg: Record<string, unknown>;
  onChange: (key: string, value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}

const NumInput: React.FC<NumInputProps> = ({
  label, ckey, cfg, onChange, step = 1, min, max,
}) => {
  const raw = (cfg[ckey] as number) ?? 0;
  return (
    <div className="input-row">
      <label>{label}</label>
      <input
        type="number" step={step} min={min} max={max}
        value={parseFloat(raw.toFixed(6))}
        onChange={e => onChange(ckey, parseFloat(e.target.value))}
      />
    </div>
  );
};

export default DeviceConfigPanel;
