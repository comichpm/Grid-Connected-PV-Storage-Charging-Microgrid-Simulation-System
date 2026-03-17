"""Load device simulator."""

import math
import random
import logging
from typing import Dict, Any, List

from .base_device import BaseDevice

logger = logging.getLogger(__name__)

# Load mode constants
LOAD_MODE_CONSTANT = "constant"
LOAD_MODE_DAILY = "daily_curve"
LOAD_MODE_RANDOM = "random"
LOAD_MODE_INDUCTIVE = "inductive"       # Req 5: inductive load (lagging PF)
LOAD_MODE_CAPACITIVE = "capacitive"     # Req 5: capacitive load (leading PF)
LOAD_MODE_IMPULSE = "impulse"           # Req 5: periodic impulse/surge loads
LOAD_MODE_MOTOR = "motor_start"         # Req 5: motor-start (high inrush)

ALL_MODES = [
    LOAD_MODE_CONSTANT, LOAD_MODE_DAILY, LOAD_MODE_RANDOM,
    LOAD_MODE_INDUCTIVE, LOAD_MODE_CAPACITIVE, LOAD_MODE_IMPULSE, LOAD_MODE_MOTOR,
]


class LoadDevice(BaseDevice):
    """Simulates an electrical load.

    Power convention: +kW (always consuming from grid).
    Reactive power (kvar) is tracked for inductive/capacitive modes.
    """

    def __init__(self, device_id: str, name: str, config: Dict[str, Any],
                 modbus_port: int, modbus_slave_id: int):
        super().__init__(device_id, name, "load", config, modbus_port, modbus_slave_id)

        self.rated_power_kw: float = config.get("rated_power_kw", 50.0)
        self.load_mode: str = config.get("load_mode", LOAD_MODE_DAILY)
        self.base_load_ratio: float = config.get("base_load_ratio", 0.3)
        self.load_adjust_ratio: float = config.get("load_adjust_ratio", 1.0)

        # Power factor settings (Req 5 – inductive/capacitive)
        self.power_factor: float = config.get("power_factor", 0.9)   # lagging by default
        self.reactive_power_kvar: float = 0.0

        # Impulse load settings (Req 5)
        self.impulse_interval_s: float = config.get("impulse_interval_s", 60.0)
        self.impulse_duration_s: float = config.get("impulse_duration_s", 5.0)
        self.impulse_peak_ratio: float = config.get("impulse_peak_ratio", 3.0)
        self._impulse_phase: float = 0.0   # accumulated time for impulse tracking

        # Motor start settings (Req 5)
        self.motor_start_peak_ratio: float = config.get("motor_start_peak_ratio", 6.0)
        self.motor_start_duration_s: float = config.get("motor_start_duration_s", 3.0)
        self._motor_start_phase: float = -1.0  # -1 = not started yet for this cycle
        self.motor_start_interval_s: float = config.get("motor_start_interval_s", 300.0)
        self._motor_cycle_timer: float = 0.0

        self.daily_energy_kwh: float = 0.0
        self._last_day: int = 0

        self.voltage_v = 400.0
        self.apparent_power_kva: float = 0.0

    def _daily_curve(self, hour: float) -> float:
        """Typical commercial building double-peak load profile."""
        morning = math.exp(-((hour - 10.0) ** 2) / (2.0 * 2.0 ** 2))
        afternoon = math.exp(-((hour - 16.0) ** 2) / (2.0 * 2.5 ** 2))
        curve = self.base_load_ratio + (1.0 - self.base_load_ratio) * max(morning, afternoon)
        return min(1.0, curve)

    def _base_power(self, hour_of_day: float) -> float:
        """Return base active power (kW) before mode-specific shaping."""
        if self.load_mode in (LOAD_MODE_CONSTANT, LOAD_MODE_INDUCTIVE, LOAD_MODE_CAPACITIVE):
            ratio = self.base_load_ratio
        elif self.load_mode in (LOAD_MODE_DAILY, LOAD_MODE_IMPULSE):
            ratio = self._daily_curve(hour_of_day)
        elif self.load_mode == LOAD_MODE_RANDOM:
            ratio = self._daily_curve(hour_of_day) * random.uniform(0.9, 1.1)
        elif self.load_mode == LOAD_MODE_MOTOR:
            ratio = self._daily_curve(hour_of_day)
        else:
            ratio = self.base_load_ratio
        return self.rated_power_kw * ratio * self.load_adjust_ratio

    def update(self, sim_time_hours: float, dt_seconds: float) -> None:
        dt_hours = dt_seconds / 3600.0
        day_num = int(sim_time_hours / 24)
        hour_of_day = sim_time_hours % 24.0

        if day_num != self._last_day:
            self.daily_energy_kwh = 0.0
            self._last_day = day_num

        if not self.online:
            self.power_kw = 0.0
            self.reactive_power_kvar = 0.0
            self.apparent_power_kva = 0.0
            return

        base_kw = max(0.0, self._base_power(hour_of_day))

        # ---- Mode-specific shaping ----
        if self.load_mode == LOAD_MODE_INDUCTIVE:
            # Lagging power factor: P = S * PF, Q = S * sin(acos(PF))
            pf = max(0.1, min(1.0, self.power_factor))
            active_kw = base_kw
            reactive = active_kw * math.tan(math.acos(pf))
            self.power_kw = active_kw
            self.reactive_power_kvar = reactive

        elif self.load_mode == LOAD_MODE_CAPACITIVE:
            # Leading power factor (negative Q)
            pf = max(0.1, min(1.0, self.power_factor))
            active_kw = base_kw
            self.power_kw = active_kw
            self.reactive_power_kvar = -active_kw * math.tan(math.acos(pf))

        elif self.load_mode == LOAD_MODE_IMPULSE:
            # Periodic impulse/surge (e.g. elevator, compressor cycling)
            self._impulse_phase = (self._impulse_phase + dt_seconds) % max(1.0, self.impulse_interval_s)
            if self._impulse_phase < self.impulse_duration_s:
                self.power_kw = base_kw * self.impulse_peak_ratio
            else:
                self.power_kw = base_kw
            self.reactive_power_kvar = 0.0

        elif self.load_mode == LOAD_MODE_MOTOR:
            # Motor start: high inrush on startup, then settles
            self._motor_cycle_timer += dt_seconds
            if self._motor_cycle_timer >= self.motor_start_interval_s:
                self._motor_cycle_timer = 0.0
                self._motor_start_phase = 0.0  # trigger a new start

            if self._motor_start_phase >= 0.0:
                if self._motor_start_phase < self.motor_start_duration_s:
                    # Exponentially decaying inrush
                    decay = math.exp(-self._motor_start_phase / (self.motor_start_duration_s / 3.0))
                    peak_factor = 1.0 + (self.motor_start_peak_ratio - 1.0) * decay
                    self.power_kw = base_kw * peak_factor
                    self._motor_start_phase += dt_seconds
                else:
                    self._motor_start_phase = -1.0  # start complete
                    self.power_kw = base_kw
            else:
                self.power_kw = base_kw
            self.reactive_power_kvar = base_kw * math.tan(math.acos(max(0.1, self.power_factor)))

        else:
            # constant / daily_curve / random
            self.power_kw = base_kw
            self.reactive_power_kvar = 0.0

        # Clamp
        self.power_kw = max(0.0, self.power_kw)

        # Apparent power
        self.apparent_power_kva = math.sqrt(self.power_kw ** 2 + self.reactive_power_kvar ** 2)

        self.daily_energy_kwh += self.power_kw * dt_hours

        if self.voltage_v > 0:
            self.current_a = (self.apparent_power_kva * 1000.0) / (self.voltage_v * 1.732)

    def get_state_dict(self) -> Dict[str, Any]:
        return {
            "id": self.device_id,
            "name": self.name,
            "device_type": "load",
            "online": self.online,
            "power_kw": round(self.power_kw, 3),
            "reactive_power_kvar": round(self.reactive_power_kvar, 3),
            "apparent_power_kva": round(self.apparent_power_kva, 3),
            "power_factor": self.power_factor,
            "load_mode": self.load_mode,
            "base_load_ratio": self.base_load_ratio,
            "load_adjust_ratio": self.load_adjust_ratio,
            "voltage_v": round(self.voltage_v, 1),
            "current_a": round(self.current_a, 2),
            "daily_energy_kwh": round(self.daily_energy_kwh, 3),
            "rated_power_kw": self.rated_power_kw,
            "impulse_interval_s": self.impulse_interval_s,
            "impulse_duration_s": self.impulse_duration_s,
            "impulse_peak_ratio": self.impulse_peak_ratio,
            "motor_start_peak_ratio": self.motor_start_peak_ratio,
            "motor_start_duration_s": self.motor_start_duration_s,
        }

    def _build_registers(self) -> None:
        mode_map = {m: i for i, m in enumerate(ALL_MODES)}
        regs = self._registers
        # 0: online (0/1)
        # 1: load mode index
        # 2: actual active power kW x10
        # 3: load adjust ratio x100
        # 4: base load ratio x100
        # 5: rated power kW x10
        # 6: daily energy kWh x10
        # 7: voltage V x10
        # 8: current A x10
        # 9: power factor x1000
        # 10: reactive power kvar x10 (signed)
        # 11: apparent power kVA x10
        # 12: impulse peak ratio x10
        regs[0] = 1 if self.online else 0
        regs[1] = mode_map.get(self.load_mode, 1)
        regs[2] = self._to_reg(self.power_kw, 10.0)
        regs[3] = self._to_reg(self.load_adjust_ratio * 100.0, 1.0)
        regs[4] = self._to_reg(self.base_load_ratio * 100.0, 1.0)
        regs[5] = self._to_reg(self.rated_power_kw, 10.0)
        regs[6] = self._to_reg(self.daily_energy_kwh, 10.0)
        regs[7] = self._to_reg(self.voltage_v, 10.0)
        regs[8] = self._to_reg(self.current_a, 10.0)
        regs[9] = self._to_reg(self.power_factor, 1000.0)
        regs[10] = self._signed_to_reg(self.reactive_power_kvar, 10.0)
        regs[11] = self._to_reg(self.apparent_power_kva, 10.0)
        regs[12] = self._to_reg(self.impulse_peak_ratio, 10.0)

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
            elif addr == 1:
                if 0 <= val < len(ALL_MODES):
                    self.load_mode = ALL_MODES[val]
            elif addr == 3:
                self.load_adjust_ratio = max(0.0, min(2.0, val / 100.0))
            elif addr == 9:
                self.power_factor = max(0.1, min(1.0, val / 1000.0))
