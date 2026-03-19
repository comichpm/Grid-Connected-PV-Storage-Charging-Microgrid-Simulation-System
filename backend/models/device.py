"""Device data models (Pydantic)."""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class DeviceBase(BaseModel):
    name: str
    device_type: str  # grid | pv | bess | ev_charger | load | smart_meter
    modbus_port: int = 5020
    modbus_slave_id: int = 1


class ModbusRTUConfig(BaseModel):
    """Shared Modbus RTU serial settings."""
    modbus_mode: str = "tcp"               # "tcp" or "rtu"
    modbus_serial_port: str = "/dev/ttyUSB0"
    modbus_baud_rate: int = 9600
    modbus_parity: str = "N"
    modbus_stopbits: int = 1
    modbus_bytesize: int = 8


class GridConfig(ModbusRTUConfig):
    max_import_kw: float = 1000.0
    max_export_kw: float = 1000.0
    voltage_kv: float = 10.0
    frequency_hz: float = 50.0
    import_price: float = 0.85    # CNY/kWh
    export_price: float = 0.40    # CNY/kWh
    # Overload protection (Req 3)
    rated_capacity_kw: float = 1000.0
    overload_threshold_ratio: float = 1.2   # trip when abs(power) > rated * this
    overload_max_duration_s: float = 30.0   # trip after this many seconds
    disconnect_on_overload: bool = True


class PVConfig(ModbusRTUConfig):
    rated_power_kw: float = 100.0
    panel_area_m2: float = 500.0
    efficiency: float = 0.20
    temp_coefficient: float = -0.004
    noct_temp: float = 45.0
    # Weather (Req 6)
    weather_mode: str = "sunny"          # sunny|partly_cloudy|cloudy|rainy|snowy|foggy|custom
    custom_irr_factor: float = 1.0       # used when weather_mode="custom"
    sunrise_h: float = 6.0
    sunset_h: float = 18.0
    peak_h: float = 12.0
    custom_curve: List[List[float]] = Field(default_factory=list)  # [[hour, fraction],...]


class BESSConfig(ModbusRTUConfig):
    rated_power_kw: float = 100.0
    capacity_kwh: float = 200.0
    initial_soc: float = 50.0
    min_soc: float = 10.0
    max_soc: float = 90.0
    charge_efficiency: float = 0.95
    discharge_efficiency: float = 0.95
    nominal_voltage_v: float = 700.0


class EVChargerConfig(ModbusRTUConfig):
    rated_power_kw: float = 60.0
    max_voltage_v: float = 750.0
    max_current_a: float = 250.0
    auto_simulate: bool = True
    initial_vehicle_soc: float = 20.0
    target_vehicle_soc: float = 90.0
    vehicle_battery_kwh: float = 60.0


class LoadConfig(ModbusRTUConfig):
    rated_power_kw: float = 50.0
    load_mode: str = "daily_curve"       # constant|daily_curve|random|inductive|capacitive|impulse|motor_start
    base_load_ratio: float = 1.0         # operating level for constant/inductive/capacitive (1.0=full rated)
    load_adjust_ratio: float = 1.0
    power_factor: float = 0.9            # for inductive/capacitive/motor modes
    # Impulse load (Req 5)
    impulse_interval_s: float = 60.0
    impulse_duration_s: float = 5.0
    impulse_peak_ratio: float = 3.0
    # Motor start (Req 5)
    motor_start_peak_ratio: float = 6.0
    motor_start_duration_s: float = 3.0
    motor_start_interval_s: float = 300.0


class SmartMeterConfig(ModbusRTUConfig):
    """Smart meter aggregates readings from a list of monitored devices (Req 7+8)."""
    monitored_device_ids: List[str] = Field(default_factory=list)


class DeviceCreate(BaseModel):
    name: str
    device_type: str
    modbus_port: int = 5020
    modbus_slave_id: int = 1
    config: Dict[str, Any] = Field(default_factory=dict)
    position_x: float = 100.0
    position_y: float = 100.0


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    modbus_port: Optional[int] = None
    modbus_slave_id: Optional[int] = None
    config: Optional[Dict[str, Any]] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class DeviceResponse(BaseModel):
    id: str
    name: str
    device_type: str
    modbus_port: int
    modbus_slave_id: int
    config: Dict[str, Any]
    position_x: float
    position_y: float
    state: Dict[str, Any] = Field(default_factory=dict)
