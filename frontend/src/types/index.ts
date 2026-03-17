// TypeScript type definitions for the microgrid simulation system

export type DeviceType = 'grid' | 'pv' | 'bess' | 'ev_charger' | 'load';

export interface DeviceConfig {
  // Grid
  max_import_kw?: number;
  max_export_kw?: number;
  voltage_kv?: number;
  frequency_hz?: number;
  import_price?: number;
  export_price?: number;
  // PV
  rated_power_kw?: number;
  panel_area_m2?: number;
  efficiency?: number;
  temp_coefficient?: number;
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
  load_mode?: 'constant' | 'daily_curve' | 'random';
  base_load_ratio?: number;
  load_adjust_ratio?: number;
  [key: string]: unknown;
}

export interface DeviceState {
  id: string;
  name: string;
  device_type: DeviceType;
  online: boolean;
  power_kw: number;
  // Grid specific
  grid_status?: number;
  voltage_kv?: number;
  frequency_hz?: number;
  total_import_kwh?: number;
  total_export_kwh?: number;
  // PV specific
  irradiance_wm2?: number;
  cell_temp_c?: number;
  daily_energy_kwh?: number;
  power_limit_ratio?: number;
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
  load_mode?: string;
  load_adjust_ratio?: number;
  voltage_v?: number;
  current_a?: number;
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
  grid_power_kw: number;
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
