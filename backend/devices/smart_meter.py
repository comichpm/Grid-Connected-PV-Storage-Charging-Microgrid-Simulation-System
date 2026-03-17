"""Smart Meter device simulator (Req 7+8).

Aggregates real-time measurements from multiple monitored devices and
exposes them via Modbus TCP or RTU.
"""

import math
import logging
from typing import Dict, Any, List, Optional

from .base_device import BaseDevice

logger = logging.getLogger(__name__)


class SmartMeterDevice(BaseDevice):
    """Intelligent energy meter that monitors and aggregates power from
    a configurable set of other devices.

    Features:
    - Measures total active power, reactive power, apparent power
    - Tracks cumulative energy (import + export) across all monitored devices
    - Supports Modbus TCP and RTU (Req 7)
    - Provides aggregated output that can trigger protection/control (Req 8)

    The meter itself has zero power_kw (it does not consume or produce energy).
    """

    def __init__(self, device_id: str, name: str, config: Dict[str, Any],
                 modbus_port: int, modbus_slave_id: int):
        super().__init__(device_id, name, "smart_meter", config, modbus_port, modbus_slave_id)

        # List of device IDs to monitor (Req 8)
        self.monitored_device_ids: List[str] = list(config.get("monitored_device_ids", []))

        # Reference to the simulation engine's devices registry
        # Set externally by the simulation engine
        self._devices_registry: Optional[Dict[str, "BaseDevice"]] = None  # type: ignore[name-defined]

        # Aggregated measurements
        self.total_active_kw: float = 0.0        # sum of active power
        self.total_reactive_kvar: float = 0.0     # sum of reactive power
        self.total_apparent_kva: float = 0.0      # apparent
        self.power_factor: float = 1.0
        self.total_import_kwh: float = 0.0        # cumulative positive energy
        self.total_export_kwh: float = 0.0        # cumulative negative energy (abs)
        self.monitored_count: int = 0             # number of devices actually found

        # Voltage and frequency (from grid device if present, else nominal)
        self.measured_voltage_v: float = 400.0
        self.measured_frequency_hz: float = 50.0

        # The meter does not consume power itself
        self.power_kw = 0.0
        self.voltage_v = 400.0

    def set_devices_registry(self, registry: Dict[str, Any]) -> None:
        """Set reference to the simulation engine device registry."""
        self._devices_registry = registry

    def update(self, sim_time_hours: float, dt_seconds: float) -> None:
        dt_hours = dt_seconds / 3600.0

        if not self.online or self._devices_registry is None:
            return

        total_active = 0.0
        total_reactive = 0.0
        found = 0

        # Determine which device IDs to monitor:
        # If monitored_device_ids is empty, monitor ALL non-grid, non-smart-meter devices.
        # (Exclude the grid/slack bus since its power is just the balance residual.)
        if self.monitored_device_ids:
            target_ids = self.monitored_device_ids
        else:
            target_ids = [
                dev_id for dev_id, dev in self._devices_registry.items()
                if dev.device_type not in ("smart_meter", "grid")
            ]

        for dev_id in target_ids:
            dev = self._devices_registry.get(dev_id)
            if dev is None:
                continue
            found += 1
            total_active += dev.power_kw
            # Read reactive power if available
            reactive = getattr(dev, "reactive_power_kvar", 0.0)
            total_reactive += reactive

            # Grab voltage/frequency from grid device for reference
            if dev.device_type == "grid" and dev.online:
                self.measured_voltage_v = getattr(dev, "voltage_v", 400.0)
                self.measured_frequency_hz = getattr(dev, "frequency_hz", 50.0)

        self.monitored_count = found
        self.total_active_kw = total_active
        self.total_reactive_kvar = total_reactive
        self.total_apparent_kva = math.sqrt(total_active ** 2 + total_reactive ** 2)
        if self.total_apparent_kva > 0:
            self.power_factor = abs(total_active) / self.total_apparent_kva
        else:
            self.power_factor = 1.0

        # Cumulative energy
        if total_active > 0:
            self.total_import_kwh += total_active * dt_hours
        else:
            self.total_export_kwh += abs(total_active) * dt_hours

        # Voltage and current (meter measurement circuit, informational)
        self.voltage_v = self.measured_voltage_v
        if self.measured_voltage_v > 0:
            self.current_a = (self.total_apparent_kva * 1000.0) / (self.measured_voltage_v * 1.732)

        # The meter itself has no power consumption
        self.power_kw = 0.0

    def get_state_dict(self) -> Dict[str, Any]:
        # When monitored_device_ids is empty we auto-monitor all non-grid devices
        monitor_mode = "自动(非电网)" if not self.monitored_device_ids else "自定义"
        return {
            "id": self.device_id,
            "name": self.name,
            "device_type": "smart_meter",
            "online": self.online,
            "power_kw": 0.0,   # meter itself has no load
            "total_active_kw": round(self.total_active_kw, 3),
            "total_reactive_kvar": round(self.total_reactive_kvar, 3),
            "total_apparent_kva": round(self.total_apparent_kva, 3),
            "power_factor": round(self.power_factor, 4),
            "total_import_kwh": round(self.total_import_kwh, 3),
            "total_export_kwh": round(self.total_export_kwh, 3),
            "monitored_device_ids": self.monitored_device_ids,
            "monitored_count": self.monitored_count,
            "monitor_mode": monitor_mode,
            "measured_voltage_v": round(self.measured_voltage_v, 1),
            "measured_frequency_hz": round(self.measured_frequency_hz, 2),
            "voltage_v": round(self.voltage_v, 1),
            "current_a": round(self.current_a, 2),
        }

    def _build_registers(self) -> None:
        regs = self._registers
        # 0: online (0/1)
        # 1: monitored device count
        # 2: total active power kW x10 (signed)
        # 3: total reactive power kvar x10 (signed)
        # 4: total apparent power kVA x10
        # 5: power factor x1000
        # 6: total import kWh (integer)
        # 7: total export kWh (integer)
        # 8: measured voltage V x10
        # 9: measured frequency Hz x100
        # 10: current A x10
        regs[0] = 1 if self.online else 0
        regs[1] = self.monitored_count
        regs[2] = self._signed_to_reg(self.total_active_kw, 10.0)
        regs[3] = self._signed_to_reg(self.total_reactive_kvar, 10.0)
        regs[4] = self._to_reg(self.total_apparent_kva, 10.0)
        regs[5] = self._to_reg(self.power_factor, 1000.0)
        regs[6] = int(self.total_import_kwh)
        regs[7] = int(self.total_export_kwh)
        regs[8] = self._to_reg(self.measured_voltage_v, 10.0)
        regs[9] = self._to_reg(self.measured_frequency_hz, 100.0)
        regs[10] = self._to_reg(self.current_a, 10.0)

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
