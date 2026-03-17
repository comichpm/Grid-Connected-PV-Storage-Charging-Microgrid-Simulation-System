"""EV Charger device simulator."""

import random
import logging
from typing import Dict, Any, List

from .base_device import BaseDevice

logger = logging.getLogger(__name__)

# Charger status constants
STATUS_IDLE = 0
STATUS_CONNECTED = 1
STATUS_CHARGING = 2
STATUS_FULL = 3
STATUS_ERROR = 4


class EVChargerDevice(BaseDevice):
    """Simulates a DC fast charger with CC-CV charging curve.

    Power convention: +kW (consuming power from grid/storage).
    """

    def __init__(self, device_id: str, name: str, config: Dict[str, Any],
                 modbus_port: int, modbus_slave_id: int):
        super().__init__(device_id, name, "ev_charger", config, modbus_port, modbus_slave_id)

        self.rated_power_kw: float = config.get("rated_power_kw", 60.0)
        self.max_voltage_v: float = config.get("max_voltage_v", 750.0)
        self.max_current_a: float = config.get("max_current_a", 250.0)
        self.auto_simulate: bool = config.get("auto_simulate", True)
        self.power_limit_kw: float = self.rated_power_kw

        # Vehicle state
        self.gun_connected: bool = False
        self.charge_status: int = STATUS_IDLE
        self.vehicle_soc: float = config.get("initial_vehicle_soc", 20.0)
        self.target_soc: float = config.get("target_vehicle_soc", 90.0)
        self.vehicle_battery_kwh: float = config.get("vehicle_battery_kwh", 60.0)
        self.session_energy_kwh: float = 0.0
        self.total_energy_kwh: float = 0.0

        # Auto-simulate timing
        self._next_event_hour: float = 0.0
        self._session_duration_h: float = 0.0
        self._session_start_h: float = 0.0
        self._schedule_next_event(0.0)

        self.voltage_v = 0.0
        self.current_a = 0.0

    def _schedule_next_event(self, current_hour: float) -> None:
        """Schedule the next random vehicle arrival in auto-simulate mode."""
        # Vehicles arrive every 2–6 hours
        self._next_event_hour = current_hour + random.uniform(2.0, 6.0)

    def _cc_cv_power(self) -> float:
        """Return charging power based on CC-CV curve."""
        if self.vehicle_soc >= self.target_soc:
            return 0.0
        available = min(self.rated_power_kw, self.power_limit_kw)
        if self.vehicle_soc < 80.0:
            return available
        # Linear ramp down from 80% to target
        ratio = (self.target_soc - self.vehicle_soc) / max(1.0, self.target_soc - 80.0)
        return available * max(0.05, min(1.0, ratio))

    def update(self, sim_time_hours: float, dt_seconds: float) -> None:
        dt_hours = dt_seconds / 3600.0
        hour_of_day = sim_time_hours % 24.0

        if not self.online:
            self.power_kw = 0.0
            self.voltage_v = 0.0
            self.current_a = 0.0
            self.gun_connected = False
            self.charge_status = STATUS_IDLE
            return

        # Auto-simulate: plug in/out events
        if self.auto_simulate and sim_time_hours >= self._next_event_hour:
            if not self.gun_connected:
                self.gun_connected = True
                self.vehicle_soc = random.uniform(10.0, 40.0)
                self.target_soc = random.uniform(80.0, 95.0)
                self.vehicle_battery_kwh = random.choice([40.0, 60.0, 75.0, 100.0])
                self.session_energy_kwh = 0.0
                self.charge_status = STATUS_CONNECTED
                self._session_start_h = sim_time_hours
            else:
                # Unplug
                self.gun_connected = False
                self.charge_status = STATUS_IDLE
                self._schedule_next_event(sim_time_hours)

        if self.gun_connected:
            if self.vehicle_soc < self.target_soc:
                self.charge_status = STATUS_CHARGING
                charge_power = self._cc_cv_power()
                self.power_kw = charge_power

                # Update vehicle SOC
                energy_kw = charge_power * dt_hours
                self.vehicle_soc += (energy_kw / max(0.1, self.vehicle_battery_kwh)) * 100.0
                self.vehicle_soc = min(self.vehicle_soc, 100.0)
                self.session_energy_kwh += energy_kw
                self.total_energy_kwh += energy_kw

                # Charging voltage/current
                self.voltage_v = min(self.max_voltage_v,
                                     400.0 + (self.vehicle_soc / 100.0) * 350.0)
                if self.voltage_v > 0:
                    self.current_a = (charge_power * 1000.0) / self.voltage_v
            else:
                # Fully charged – wait for next auto-event to unplug
                self.charge_status = STATUS_FULL
                self.power_kw = 0.0
                self.current_a = 0.0
                if self.auto_simulate:
                    # Unplug after full charge
                    self.gun_connected = False
                    self.charge_status = STATUS_IDLE
                    self._schedule_next_event(sim_time_hours)
        else:
            self.power_kw = 0.0
            self.voltage_v = 0.0
            self.current_a = 0.0
            if self.charge_status not in (STATUS_IDLE,):
                self.charge_status = STATUS_IDLE

    def get_state_dict(self) -> Dict[str, Any]:
        return {
            "id": self.device_id,
            "name": self.name,
            "device_type": "ev_charger",
            "online": self.online,
            "power_kw": round(self.power_kw, 3),
            "gun_connected": self.gun_connected,
            "charge_status": self.charge_status,
            "vehicle_soc": round(self.vehicle_soc, 1),
            "target_soc": round(self.target_soc, 1),
            "voltage_v": round(self.voltage_v, 1),
            "current_a": round(self.current_a, 2),
            "session_energy_kwh": round(self.session_energy_kwh, 3),
            "total_energy_kwh": round(self.total_energy_kwh, 3),
            "rated_power_kw": self.rated_power_kw,
            "power_limit_kw": self.power_limit_kw,
            "auto_simulate": self.auto_simulate,
        }

    def _build_registers(self) -> None:
        regs = self._registers
        # 0: online (0/1)
        # 1: gun connected (0/1)
        # 2: charge status (0=idle,1=connected,2=charging,3=full,4=error)
        # 3: power kW ×10
        # 4: vehicle SOC ×10
        # 5: target SOC ×10
        # 6: voltage V ×10
        # 7: current A ×10
        # 8: session energy kWh ×10
        # 9: total energy kWh (integer)
        # 10: rated power kW ×10
        # 11: power limit kW ×10
        regs[0] = 1 if self.online else 0
        regs[1] = 1 if self.gun_connected else 0
        regs[2] = self.charge_status
        regs[3] = self._to_reg(self.power_kw, 10.0)
        regs[4] = self._to_reg(self.vehicle_soc, 10.0)
        regs[5] = self._to_reg(self.target_soc, 10.0)
        regs[6] = self._to_reg(self.voltage_v, 10.0)
        regs[7] = self._to_reg(self.current_a, 10.0)
        regs[8] = self._to_reg(self.session_energy_kwh, 10.0)
        regs[9] = int(self.total_energy_kwh)
        regs[10] = self._to_reg(self.rated_power_kw, 10.0)
        regs[11] = self._to_reg(self.power_limit_kw, 10.0)

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
            elif addr == 1:
                self.gun_connected = bool(val)
                if not self.gun_connected:
                    self.charge_status = STATUS_IDLE
            elif addr == 11:
                self.power_limit_kw = min(
                    self._from_reg(val, 10.0), self.rated_power_kw
                )
