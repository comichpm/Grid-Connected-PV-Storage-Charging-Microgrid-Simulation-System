"""Device data models (Pydantic)."""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class DeviceBase(BaseModel):
    name: str
    device_type: str  # grid | pv | bess | ev_charger | load
    modbus_port: int = 5020
    modbus_slave_id: int = 1


class GridConfig(BaseModel):
    max_import_kw: float = 1000.0
    max_export_kw: float = 1000.0
    voltage_kv: float = 10.0
    frequency_hz: float = 50.0
    import_price: float = 0.85   # ¥/kWh
    export_price: float = 0.40   # ¥/kWh


class PVConfig(BaseModel):
    rated_power_kw: float = 100.0
    panel_area_m2: float = 500.0
    efficiency: float = 0.20
    temp_coefficient: float = -0.004  # per °C above 25°C
    noct_temp: float = 45.0           # Nominal Operating Cell Temperature


class BESSConfig(BaseModel):
    rated_power_kw: float = 100.0
    capacity_kwh: float = 200.0
    initial_soc: float = 50.0    # %
    min_soc: float = 10.0        # %
    max_soc: float = 90.0        # %
    charge_efficiency: float = 0.95
    discharge_efficiency: float = 0.95
    nominal_voltage_v: float = 700.0


class EVChargerConfig(BaseModel):
    rated_power_kw: float = 60.0
    max_voltage_v: float = 750.0
    max_current_a: float = 250.0
    auto_simulate: bool = True
    initial_vehicle_soc: float = 20.0
    target_vehicle_soc: float = 90.0
    vehicle_battery_kwh: float = 60.0


class LoadConfig(BaseModel):
    rated_power_kw: float = 50.0
    load_mode: str = "daily_curve"  # constant | daily_curve | random
    base_load_ratio: float = 0.3    # minimum load as fraction of rated
    load_adjust_ratio: float = 1.0  # manual adjustment multiplier


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
