// TypeScript type definitions for the microgrid simulation system

export type DeviceType = 'grid' | 'pv' | 'bess' | 'ev_charger' | 'load' | 'smart_meter';

export type LoadMode =
  | 'constant' | 'daily_curve' | 'random'
  | 'inductive' | 'capacitive' | 'impulse' | 'motor_start';

export type WeatherMode =
  | 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'custom';

export type ModbusMode = 'tcp' | 'rtu';

export interface ModbusRTUFields {
  modbus_mode?: ModbusMode;
  modbus_serial_port?: string;
  modbus_baud_rate?: number;
  modbus_parity?: string;
  modbus_stopbits?: number;
  modbus_bytesize?: number;
}

export interface DeviceConfig extends ModbusRTUFields {
  // Grid
  max_import_kw?: number;
  max_export_kw?: number;
  voltage_kv?: number;
  frequency_hz?: number;
  import_price?: number;
  export_price?: number;
  rated_capacity_kw?: number;
  overload_threshold_ratio?: number;
  overload_max_duration_s?: number;
  disconnect_on_overload?: boolean;
  // PV
  rated_power_kw?: number;
  panel_area_m2?: number;
  efficiency?: number;
  temp_coefficient?: number;
  weather_mode?: WeatherMode;
  custom_irr_factor?: number;
  sunrise_h?: number;
  sunset_h?: number;
  peak_h?: number;
  custom_curve?: number[][];
  // BESS
  capacity_kwh?: number;
  initial_soc?: number;
  min_soc?: number;
  max_soc?: number;
  charge_efficiency?: number;
  discharge_efficiency?: number;
  // EV Charger
  max_voltage_v?: number;
  max_current_a?: number;
  auto_simulate?: boolean;
  initial_vehicle_soc?: number;
  target_vehicle_soc?: number;
  vehicle_battery_kwh?: number;
  // Load
  load_mode?: LoadMode;
  base_load_ratio?: number;
  load_adjust_ratio?: number;
  power_factor?: number;
  impulse_interval_s?: number;
  impulse_duration_s?: number;
  impulse_peak_ratio?: number;
  motor_start_peak_ratio?: number;
  motor_start_duration_s?: number;
  motor_start_interval_s?: number;
  // Smart Meter
  monitored_device_ids?: string[];
  [key: string]: unknown;
}

export interface DeviceState {
  id: string;
  name: string;
  device_type: DeviceType;
  online: boolean;
  power_kw: number;
  // Grid specific
  grid_status?: number;    // 0=offline, 1=import, 2=export, 3=idle, 4=overload-trip
  voltage_kv?: number;
  frequency_hz?: number;
  grid_import_kwh?: number;
  grid_export_kwh?: number;
  rated_capacity_kw?: number;
  overload_timer_s?: number;
  overload_count?: number;
  disconnect_on_overload?: boolean;
  // PV specific
  irradiance_wm2?: number;
  cell_temp_c?: number;
  ambient_temp_c?: number;
  daily_energy_kwh?: number;
  power_limit_ratio?: number;
  weather_mode?: WeatherMode;
  // BESS specific
  control_mode?: number;
  power_setpoint_kw?: number;
  soc?: number;
  min_soc?: number;
  max_soc?: number;
  battery_temp_c?: number;
  total_charge_kwh?: number;
  total_discharge_kwh?: number;
  cycle_count?: number;
  capacity_kwh?: number;
  // EV Charger specific
  gun_connected?: boolean;
  charge_status?: number;
  vehicle_soc?: number;
  target_soc?: number;
  session_energy_kwh?: number;
  total_energy_kwh?: number;
  // Load specific
  load_mode?: LoadMode;
  load_adjust_ratio?: number;
  reactive_power_kvar?: number;
  apparent_power_kva?: number;
  power_factor?: number;
  // Smart Meter specific
  total_active_kw?: number;
  total_reactive_kvar?: number;
  total_apparent_kva?: number;
  total_import_kwh?: number;
  total_export_kwh?: number;
  monitored_device_ids?: string[];
  monitored_count?: number;
  measured_voltage_v?: number;
  measured_frequency_hz?: number;
  // Common
  voltage_v?: number;
  current_a?: number;
  rated_power_kw?: number;
  [key: string]: unknown;
}

export interface DeviceInfo {
  id: string;
  name: string;
  device_type: DeviceType;
  modbus_port: number;
  modbus_slave_id: number;
  config: DeviceConfig;
  position_x: number;
  position_y: number;
  state: DeviceState;
}

export interface PowerBalance {
  pv_total_kw: number;
  bess_net_kw: number;
  load_total_kw: number;
  ev_total_kw: number;
  grid_power_kw: number;    // +import (grid→load) / -export (generation→grid)
  balance_error_kw: number;
}

export interface SimulationUpdate {
  type: 'simulation_update';
  timestamp: number;
  sim_time_hours: number;
  sim_state: 'stopped' | 'running' | 'paused';
  power_balance: PowerBalance;
  devices: DeviceState[];
}

export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    deviceId: string;
    deviceType: DeviceType;
    label: string;
  };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}
