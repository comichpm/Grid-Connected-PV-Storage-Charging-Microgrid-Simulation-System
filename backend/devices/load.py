"""Load device simulator."""

import math
import random
import logging
from typing import Dict, Any, List

from .base_device import BaseDevice

logger = logging.getLogger(__name__)

LOAD_MODE_CONSTANT = "constant"
LOAD_MODE_DAILY = "daily_curve"
LOAD_MODE_RANDOM = "random"


class LoadDevice(BaseDevice):
    """Simulates an electrical load.

    Power convention: +kW (always consuming from grid).
    """

    def __init__(self, device_id: str, name: str, config: Dict[str, Any],
                 modbus_port: int, modbus_slave_id: int):
        super().__init__(device_id, name, "load", config, modbus_port, modbus_slave_id)

        self.rated_power_kw: float = config.get("rated_power_kw", 50.0)
        self.load_mode: str = config.get("load_mode", LOAD_MODE_DAILY)
        self.base_load_ratio: float = config.get("base_load_ratio", 0.3)
        self.load_adjust_ratio: float = config.get("load_adjust_ratio", 1.0)

        self.daily_energy_kwh: float = 0.0
        self._last_day: int = 0

        self.voltage_v = 400.0

    def _daily_curve(self, hour: float) -> float:
        """Typical commercial building double-peak load profile.

        Returns fraction of rated power (0.0 – 1.0).
        """
        # Morning peak ~10:00, afternoon peak ~16:00
        morning = math.exp(-((hour - 10.0) ** 2) / (2.0 * 2.0 ** 2))
        afternoon = math.exp(-((hour - 16.0) ** 2) / (2.0 * 2.5 ** 2))
        curve = self.base_load_ratio + (1.0 - self.base_load_ratio) * max(morning, afternoon)
        return min(1.0, curve)

    def update(self, sim_time_hours: float, dt_seconds: float) -> None:
        dt_hours = dt_seconds / 3600.0
        day_num = int(sim_time_hours / 24)
        hour_of_day = sim_time_hours % 24.0

        if day_num != self._last_day:
            self.daily_energy_kwh = 0.0
            self._last_day = day_num

        if not self.online:
            self.power_kw = 0.0
            return

        if self.load_mode == LOAD_MODE_CONSTANT:
            ratio = self.base_load_ratio
        elif self.load_mode == LOAD_MODE_DAILY:
            ratio = self._daily_curve(hour_of_day)
        else:  # random
            # Randomly fluctuate ±10% around the daily curve
            ratio = self._daily_curve(hour_of_day) * random.uniform(0.9, 1.1)

        self.power_kw = self.rated_power_kw * ratio * self.load_adjust_ratio
        self.power_kw = max(0.0, self.power_kw)

        self.daily_energy_kwh += self.power_kw * dt_hours

        if self.voltage_v > 0:
            self.current_a = (self.power_kw * 1000.0) / (self.voltage_v * 1.732)

    def get_state_dict(self) -> Dict[str, Any]:
        return {
            "id": self.device_id,
            "name": self.name,
            "device_type": "load",
            "online": self.online,
            "power_kw": round(self.power_kw, 3),
            "load_mode": self.load_mode,
            "base_load_ratio": self.base_load_ratio,
            "load_adjust_ratio": self.load_adjust_ratio,
            "voltage_v": round(self.voltage_v, 1),
            "current_a": round(self.current_a, 2),
            "daily_energy_kwh": round(self.daily_energy_kwh, 3),
            "rated_power_kw": self.rated_power_kw,
        }

    def _build_registers(self) -> None:
        regs = self._registers
        mode_map = {LOAD_MODE_CONSTANT: 0, LOAD_MODE_DAILY: 1, LOAD_MODE_RANDOM: 2}
        # 0: online (0/1)
        # 1: load mode (0=constant,1=daily,2=random)
        # 2: actual power kW ×10
        # 3: load adjust ratio ×100
        # 4: base load ratio ×100
        # 5: rated power kW ×10
        # 6: daily energy kWh ×10
        # 7: voltage V ×10
        # 8: current A ×10
        regs[0] = 1 if self.online else 0
        regs[1] = mode_map.get(self.load_mode, 1)
        regs[2] = self._to_reg(self.power_kw, 10.0)
        regs[3] = self._to_reg(self.load_adjust_ratio * 100.0, 1.0)
        regs[4] = self._to_reg(self.base_load_ratio * 100.0, 1.0)
        regs[5] = self._to_reg(self.rated_power_kw, 10.0)
        regs[6] = self._to_reg(self.daily_energy_kwh, 10.0)
        regs[7] = self._to_reg(self.voltage_v, 10.0)
        regs[8] = self._to_reg(self.current_a, 10.0)

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        mode_list = [LOAD_MODE_CONSTANT, LOAD_MODE_DAILY, LOAD_MODE_RANDOM]
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
            elif addr == 1:
                if 0 <= val < len(mode_list):
                    self.load_mode = mode_list[val]
            elif addr == 3:
                self.load_adjust_ratio = max(0.0, min(2.0, val / 100.0))
