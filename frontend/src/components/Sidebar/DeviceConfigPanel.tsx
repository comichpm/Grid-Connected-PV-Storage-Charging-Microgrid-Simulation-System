import React, { useState } from 'react';
import type { DeviceInfo, LoadMode, WeatherMode } from '../../types';
import { updateDevice, controlDevice } from '../../services/api';

interface DeviceConfigPanelProps {
  device: DeviceInfo | null;
  onClose: () => void;
  onUpdate: () => void;
  deviceList?: DeviceInfo[];  // for smart meter device selection
}

// ---- Label helpers ----
const LOAD_MODE_LABELS: Record<LoadMode, string> = {
  constant: '恒定功率',
  daily_curve: '日曲线',
  random: '随机波动',
  inductive: '感性负荷（滞后PF）',
  capacitive: '容性负荷（超前PF）',
  impulse: '冲击/突变负荷',
  motor_start: '电机起动（高涌流）',
};

const WEATHER_MODE_LABELS: Record<WeatherMode, string> = {
  sunny: '☀️ 晴天',
  partly_cloudy: '⛅ 多云',
  cloudy: '☁️ 阴天',
  rainy: '🌧️ 雨天',
  snowy: '❄️ 雪天',
  foggy: '🌫️ 雾天',
  custom: '🔧 自定义',
};

const GRID_STATUS_LABELS: Record<number, string> = {
  0: '离线', 1: '从电网取电', 2: '向电网送电', 3: '空载', 4: '过载跳闸',
};

// ---- Modbus RTU/TCP shared config ----
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
            <label>串口端口</label>
            <input
              type="text"
              value={(config.modbus_serial_port as string) || '/dev/ttyUSB0'}
              onChange={e => onChange('modbus_serial_port', e.target.value)}
              placeholder="/dev/ttyUSB0"
            />
          </div>
          <div className="input-row">
            <label>波特率</label>
            <select
              value={(config.modbus_baud_rate as number) || 9600}
              onChange={e => onChange('modbus_baud_rate', parseInt(e.target.value, 10))}
            >
              {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="input-row">
            <label>校验位</label>
            <select
              value={(config.modbus_parity as string) || 'N'}
              onChange={e => onChange('modbus_parity', e.target.value)}
            >
              <option value="N">无校验 (N)</option>
              <option value="E">偶校验 (E)</option>
              <option value="O">奇校验 (O)</option>
            </select>
          </div>
          <div className="input-row">
            <label>停止位</label>
            <select
              value={(config.modbus_stopbits as number) || 1}
              onChange={e => onChange('modbus_stopbits', parseInt(e.target.value, 10))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
};

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

  React.useEffect(() => {
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

  // ---- Device-type specific config editors ----
  const renderGridConfig = () => (
    <>
      <div className="config-subsection">
        <div className="subsection-title">电网参数</div>
        <NumInput label="额定容量 (kW)" ckey="rated_capacity_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="最大取电功率 (kW)" ckey="max_import_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="最大送电功率 (kW)" ckey="max_export_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="额定电压 (kV)" ckey="voltage_kv" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="频率 (Hz)" ckey="frequency_hz" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="购电价格 (元/kWh)" ckey="import_price" cfg={editConfig} onChange={handleConfigChange} step={0.01} />
        <NumInput label="售电价格 (元/kWh)" ckey="export_price" cfg={editConfig} onChange={handleConfigChange} step={0.01} />
      </div>
      <div className="config-subsection">
        <div className="subsection-title">过载保护</div>
        <NumInput label="过载倍数阈值" ckey="overload_threshold_ratio" cfg={editConfig} onChange={handleConfigChange} step={0.1} />
        <NumInput label="允许过载时长 (s)" ckey="overload_max_duration_s" cfg={editConfig} onChange={handleConfigChange} />
        <div className="input-row">
          <label>过载自动断网</label>
          <input
            type="checkbox"
            checked={editConfig.disconnect_on_overload as boolean ?? true}
            onChange={e => handleConfigChange('disconnect_on_overload', e.target.checked)}
          />
        </div>
      </div>
      <ModbusProtocolConfig config={editConfig} onChange={handleConfigChange} />
    </>
  );

  const renderPVConfig = () => (
    <>
      <div className="config-subsection">
        <div className="subsection-title">光伏参数</div>
        <NumInput label="额定功率 (kW)" ckey="rated_power_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="电池板面积 (m²)" ckey="panel_area_m2" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="光电效率 (%)" ckey="efficiency" cfg={editConfig} onChange={handleConfigChange}
          displayScale={100} displayUnit="%" min={1} max={30} />
        <NumInput label="温度系数 (%/°C)" ckey="temp_coefficient" cfg={editConfig} onChange={handleConfigChange}
          step={0.001} />
        <NumInput label="日出时刻 (h)" ckey="sunrise_h" cfg={editConfig} onChange={handleConfigChange} min={0} max={12} step={0.5} />
        <NumInput label="日落时刻 (h)" ckey="sunset_h" cfg={editConfig} onChange={handleConfigChange} min={12} max={24} step={0.5} />
        <NumInput label="峰值时刻 (h)" ckey="peak_h" cfg={editConfig} onChange={handleConfigChange} min={6} max={18} step={0.5} />
      </div>
      <div className="config-subsection">
        <div className="subsection-title">天气模式</div>
        <div className="input-row">
          <label>天气</label>
          <select
            value={(editConfig.weather_mode as string) || 'sunny'}
            onChange={e => handleConfigChange('weather_mode', e.target.value)}
          >
            {Object.entries(WEATHER_MODE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        {editConfig.weather_mode === 'custom' && (
          <NumInput label="自定义辐照系数" ckey="custom_irr_factor" cfg={editConfig} onChange={handleConfigChange}
            step={0.05} min={0} max={2} />
        )}
      </div>
      <ModbusProtocolConfig config={editConfig} onChange={handleConfigChange} />
    </>
  );

  const renderLoadConfig = () => {
    const mode = (editConfig.load_mode as string) || 'daily_curve';
    return (
      <>
        <div className="config-subsection">
          <div className="subsection-title">负荷参数</div>
          <NumInput label="额定功率 (kW)" ckey="rated_power_kw" cfg={editConfig} onChange={handleConfigChange} />
          <div className="input-row">
            <label>负荷模式</label>
            <select value={mode} onChange={e => handleConfigChange('load_mode', e.target.value)}>
              {Object.entries(LOAD_MODE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <NumInput label="基础负荷比例 (%)" ckey="base_load_ratio" cfg={editConfig} onChange={handleConfigChange}
            displayScale={100} displayUnit="%" min={0} max={100} />
          <NumInput label="负荷调节比例 (%)" ckey="load_adjust_ratio" cfg={editConfig} onChange={handleConfigChange}
            displayScale={100} displayUnit="%" min={0} max={200} />
        </div>

        {/* Power factor – shown for inductive/capacitive/motor modes */}
        {(mode === 'inductive' || mode === 'capacitive' || mode === 'motor_start') && (
          <div className="config-subsection">
            <div className="subsection-title">功率因数</div>
            <NumInput label="功率因数 (0.1~1.0)" ckey="power_factor" cfg={editConfig} onChange={handleConfigChange}
              step={0.01} min={0.1} max={1.0} />
          </div>
        )}

        {/* Impulse settings */}
        {mode === 'impulse' && (
          <div className="config-subsection">
            <div className="subsection-title">冲击负荷参数</div>
            <NumInput label="冲击间隔 (s)" ckey="impulse_interval_s" cfg={editConfig} onChange={handleConfigChange} />
            <NumInput label="冲击持续时间 (s)" ckey="impulse_duration_s" cfg={editConfig} onChange={handleConfigChange} />
            <NumInput label="峰值功率倍数" ckey="impulse_peak_ratio" cfg={editConfig} onChange={handleConfigChange} step={0.5} />
          </div>
        )}

        {/* Motor start settings */}
        {mode === 'motor_start' && (
          <div className="config-subsection">
            <div className="subsection-title">电机起动参数</div>
            <NumInput label="涌流倍数" ckey="motor_start_peak_ratio" cfg={editConfig} onChange={handleConfigChange} step={0.5} />
            <NumInput label="起动持续时间 (s)" ckey="motor_start_duration_s" cfg={editConfig} onChange={handleConfigChange} step={0.5} />
            <NumInput label="起动间隔 (s)" ckey="motor_start_interval_s" cfg={editConfig} onChange={handleConfigChange} />
          </div>
        )}
        <ModbusProtocolConfig config={editConfig} onChange={handleConfigChange} />
      </>
    );
  };

  const renderSmartMeterConfig = () => {
    const monitored = (editConfig.monitored_device_ids as string[]) || [];
    const otherDevices = deviceList.filter(
      d => d.id !== device.id && d.device_type !== 'smart_meter'
    );

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
          <div className="subsection-title">监测设备选择</div>
          {otherDevices.length === 0 ? (
            <div className="hint-text">请先在画布上添加其他设备</div>
          ) : (
            otherDevices.map(d => (
              <div className="input-row" key={d.id}>
                <label>{d.name} ({d.device_type})</label>
                <input
                  type="checkbox"
                  checked={monitored.includes(d.id)}
                  onChange={() => toggleDevice(d.id)}
                />
              </div>
            ))
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
        <NumInput label="充电效率 (%)" ckey="charge_efficiency" cfg={editConfig} onChange={handleConfigChange}
          displayScale={100} displayUnit="%" min={50} max={100} />
        <NumInput label="放电效率 (%)" ckey="discharge_efficiency" cfg={editConfig} onChange={handleConfigChange}
          displayScale={100} displayUnit="%" min={50} max={100} />
      </div>
    </>
  );

  const renderEVConfig = () => (
    <>
      <div className="config-subsection">
        <div className="subsection-title">充电桩参数</div>
        <NumInput label="额定功率 (kW)" ckey="rated_power_kw" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="最高电压 (V)" ckey="max_voltage_v" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="最大电流 (A)" ckey="max_current_a" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="车辆电池容量 (kWh)" ckey="vehicle_battery_kwh" cfg={editConfig} onChange={handleConfigChange} />
        <NumInput label="初始SOC (%)" ckey="initial_vehicle_soc" cfg={editConfig} onChange={handleConfigChange} min={0} max={100} />
        <NumInput label="目标SOC (%)" ckey="target_vehicle_soc" cfg={editConfig} onChange={handleConfigChange} min={0} max={100} />
        <div className="input-row">
          <label>自动模拟</label>
          <input
            type="checkbox"
            checked={editConfig.auto_simulate as boolean ?? true}
            onChange={e => handleConfigChange('auto_simulate', e.target.checked)}
          />
        </div>
      </div>
    </>
  );

  const renderConfigFields = () => {
    switch (device.device_type) {
      case 'grid': return renderGridConfig();
      case 'pv': return renderPVConfig();
      case 'load': return renderLoadConfig();
      case 'bess': return renderBESSConfig();
      case 'ev_charger': return renderEVConfig();
      case 'smart_meter': return renderSmartMeterConfig();
      default: return null;
    }
  };

  // ---- Control buttons ----
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
              <button className="ctrl-btn blue" onClick={() => handleControl('set_param', { param: 'control_mode', value: 1 })}>
                充电
              </button>
              <button className="ctrl-btn orange" onClick={() => handleControl('set_param', { param: 'control_mode', value: 2 })}>
                放电
              </button>
              <button className="ctrl-btn gray" onClick={() => handleControl('set_param', { param: 'control_mode', value: 0 })}>
                待机
              </button>
            </div>
            <div className="input-row">
              <label>功率设定值 (kW)</label>
              <input
                type="number"
                defaultValue={s?.power_setpoint_kw ?? 0}
                onBlur={e => handleControl('set_param', { param: 'power_setpoint_kw', value: parseFloat(e.target.value) })}
              />
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
              <input
                type="number" min="0" max="100"
                defaultValue={(s?.power_limit_ratio ?? 1) * 100}
                onBlur={e => handleControl('set_param', {
                  param: 'power_limit_ratio',
                  value: parseFloat(e.target.value) / 100,
                })}
              />
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
              <label>负荷调节比例 (%)</label>
              <input
                type="number" min="0" max="200"
                defaultValue={(s?.load_adjust_ratio ?? 1) * 100}
                onBlur={e => handleControl('set_param', {
                  param: 'load_adjust_ratio',
                  value: parseFloat(e.target.value) / 100,
                })}
              />
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

  // ---- Status display ----
  const renderStatus = () => {
    if (!s) return null;
    const rows: Array<[string, string]> = [];

    if (device.device_type === 'grid') {
      rows.push(['功率', `${s.power_kw! >= 0 ? '+' : ''}${s.power_kw!.toFixed(1)} kW ${s.power_kw! >= 0 ? '(取电)' : '(送电)'}`]);
      rows.push(['状态', GRID_STATUS_LABELS[s.grid_status ?? 3] ?? '']);
      rows.push(['总取电', `${(s.grid_import_kwh ?? s['total_import_kwh'] ?? 0).toFixed(1)} kWh`]);
      rows.push(['总送电', `${(s.grid_export_kwh ?? s['total_export_kwh'] ?? 0).toFixed(1)} kWh`]);
      if ((s.overload_count ?? 0) > 0)
        rows.push(['过载次数', String(s.overload_count)]);
    } else if (device.device_type === 'pv') {
      rows.push(['发电功率', `${Math.abs(s.power_kw ?? 0).toFixed(1)} kW`]);
      rows.push(['辐照度', `${(s.irradiance_wm2 ?? 0).toFixed(0)} W/m²`]);
      rows.push(['电池温度', `${(s.cell_temp_c ?? 0).toFixed(1)} °C`]);
      rows.push(['今日发电', `${(s.daily_energy_kwh ?? 0).toFixed(2)} kWh`]);
      rows.push(['天气', WEATHER_MODE_LABELS[(s.weather_mode as WeatherMode) ?? 'sunny']]);
    } else if (device.device_type === 'load') {
      rows.push(['有功功率', `${(s.power_kw ?? 0).toFixed(1)} kW`]);
      if (s.reactive_power_kvar !== undefined)
        rows.push(['无功功率', `${(s.reactive_power_kvar ?? 0).toFixed(1)} kvar`]);
      if (s.power_factor !== undefined)
        rows.push(['功率因数', (s.power_factor ?? 1).toFixed(3)]);
      rows.push(['今日耗电', `${(s.daily_energy_kwh ?? 0).toFixed(2)} kWh`]);
    } else if (device.device_type === 'smart_meter') {
      rows.push(['总有功', `${(s.total_active_kw ?? 0).toFixed(2)} kW`]);
      rows.push(['总无功', `${(s.total_reactive_kvar ?? 0).toFixed(2)} kvar`]);
      rows.push(['功率因数', (s.power_factor ?? 1).toFixed(3)]);
      rows.push(['总计取电', `${(s.total_import_kwh ?? 0).toFixed(1)} kWh`]);
      rows.push(['总计送电', `${(s.total_export_kwh ?? 0).toFixed(1)} kWh`]);
      rows.push(['监测设备数', String(s.monitored_count ?? 0)]);
    } else if (device.device_type === 'bess') {
      rows.push(['功率', `${(s.power_kw ?? 0).toFixed(1)} kW`]);
      rows.push(['SOC', `${(s.soc ?? 0).toFixed(1)} %`]);
      rows.push(['电池温度', `${(s.battery_temp_c ?? 0).toFixed(1)} °C`]);
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

  return (
    <div className="config-panel">
      <div className="config-header">
        <span>{device.name}</span>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="config-body">
        <div className="device-type-label">{device.device_type.toUpperCase()}</div>

        {renderStatus()}

        {/* Modbus TCP address */}
        <div className="config-section">
          <div className="section-title">Modbus 地址</div>
          <div className="input-row">
            <label>TCP 端口</label>
            <input
              type="number"
              value={modbusPart.port}
              onChange={e => setModbusPart(p => ({ ...p, port: parseInt(e.target.value, 10) }))}
            />
          </div>
          <div className="input-row">
            <label>从站地址</label>
            <input
              type="number"
              value={modbusPart.slaveId}
              onChange={e => setModbusPart(p => ({ ...p, slaveId: parseInt(e.target.value, 10) }))}
            />
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

// ---- Helper: numeric input with optional display scaling ----
interface NumInputProps {
  label: string;
  ckey: string;
  cfg: Record<string, unknown>;
  onChange: (key: string, value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  displayScale?: number;  // multiply for display, divide on change
  displayUnit?: string;
}

const NumInput: React.FC<NumInputProps> = ({
  label, ckey, cfg, onChange, step = 1, min, max, displayScale = 1, displayUnit = '',
}) => {
  const raw = (cfg[ckey] as number) ?? 0;
  const displayed = raw * displayScale;
  return (
    <div className="input-row">
      <label>{label}</label>
      <input
        type="number"
        step={step * displayScale}
        min={min}
        max={max}
        value={parseFloat(displayed.toFixed(6))}
        onChange={e => onChange(ckey, parseFloat(e.target.value) / displayScale)}
      />
      {displayUnit && <span className="input-unit">{displayUnit}</span>}
    </div>
  );
};

export default DeviceConfigPanel;
