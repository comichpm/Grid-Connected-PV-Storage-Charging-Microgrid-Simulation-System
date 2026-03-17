"""PV Inverter device simulator."""

import math
import logging
from typing import Dict, Any, List

from .base_device import BaseDevice

logger = logging.getLogger(__name__)


class PVDevice(BaseDevice):
    """Simulates a photovoltaic inverter.

    Power convention: power_kw is NEGATIVE (generation → injected to grid).
    """

    # Solar irradiance Gaussian parameters
    SUNRISE_H = 6.0
    SUNSET_H = 18.0
    SOLAR_PEAK_H = 12.0
    SOLAR_SIGMA = 2.5
    MAX_IRRADIANCE = 1000.0  # W/m²

    def __init__(self, device_id: str, name: str, config: Dict[str, Any],
                 modbus_port: int, modbus_slave_id: int):
        super().__init__(device_id, name, "pv", config, modbus_port, modbus_slave_id)

        self.rated_power_kw: float = config.get("rated_power_kw", 100.0)
        self.panel_area_m2: float = config.get("panel_area_m2", 500.0)
        self.efficiency: float = config.get("efficiency", 0.20)
        self.temp_coefficient: float = config.get("temp_coefficient", -0.004)
        self.noct_temp: float = config.get("noct_temp", 45.0)

        self.irradiance_wm2: float = 0.0
        self.cell_temp_c: float = 25.0
        self.ambient_temp_c: float = 25.0
        self.daily_energy_kwh: float = 0.0
        self.power_limit_ratio: float = 1.0   # 0.0–1.0 curtailment limit
        self._last_day: int = 0

        self.voltage_v = 600.0

    def _calc_irradiance(self, hour: float) -> float:
        """Return solar irradiance (W/m²) for the given hour of day."""
        if hour < self.SUNRISE_H or hour > self.SUNSET_H:
            return 0.0
        gauss = math.exp(-((hour - self.SOLAR_PEAK_H) ** 2) /
                         (2.0 * self.SOLAR_SIGMA ** 2))
        return self.MAX_IRRADIANCE * gauss

    def update(self, sim_time_hours: float, dt_seconds: float) -> None:
        dt_hours = dt_seconds / 3600.0
        day_num = int(sim_time_hours / 24)
        hour_of_day = sim_time_hours % 24.0

        if day_num != self._last_day:
            self.daily_energy_kwh = 0.0
            self._last_day = day_num

        if not self.online:
            self.power_kw = 0.0
            self.irradiance_wm2 = 0.0
            return

        self.irradiance_wm2 = self._calc_irradiance(hour_of_day)

        # Cell temperature: simplified Faiman model
        self.cell_temp_c = self.ambient_temp_c + (self.irradiance_wm2 / 800.0) * (
            self.noct_temp - 20.0
        )

        # Temperature-corrected efficiency
        temp_factor = 1.0 + self.temp_coefficient * (self.cell_temp_c - 25.0)
        effective_eff = self.efficiency * max(0.5, temp_factor)

        raw_power_kw = (self.irradiance_wm2 * self.panel_area_m2 * effective_eff) / 1000.0
        limited_power_kw = min(raw_power_kw, self.rated_power_kw * self.power_limit_ratio)
        limited_power_kw = max(0.0, limited_power_kw)

        self.power_kw = -limited_power_kw  # negative = generation

        if self.irradiance_wm2 > 0:
            self.daily_energy_kwh += limited_power_kw * dt_hours

        # Voltage varies slightly with irradiance
        self.voltage_v = 600.0 + (self.irradiance_wm2 / self.MAX_IRRADIANCE) * 50.0
        if self.voltage_v > 0:
            self.current_a = (limited_power_kw * 1000.0) / self.voltage_v

    def get_state_dict(self) -> Dict[str, Any]:
        return {
            "id": self.device_id,
            "name": self.name,
            "device_type": "pv",
            "online": self.online,
            "power_kw": round(self.power_kw, 3),
            "irradiance_wm2": round(self.irradiance_wm2, 1),
            "cell_temp_c": round(self.cell_temp_c, 1),
            "ambient_temp_c": round(self.ambient_temp_c, 1),
            "voltage_v": round(self.voltage_v, 1),
            "current_a": round(self.current_a, 2),
            "power_limit_ratio": self.power_limit_ratio,
            "daily_energy_kwh": round(self.daily_energy_kwh, 3),
            "rated_power_kw": self.rated_power_kw,
        }

    def _build_registers(self) -> None:
        regs = self._registers
        # 0: online (0/1)
        # 1: power kW ×10 (signed, negative = generation)
        # 2: irradiance W/m² ×10
        # 3: cell temperature ×10
        # 4: ambient temperature ×10
        # 5: voltage V ×10
        # 6: current A ×10
        # 7: power limit ratio ×100 (0–100)
        # 8: daily energy kWh ×10
        # 9: rated power kW ×10
        regs[0] = 1 if self.online else 0
        regs[1] = self._signed_to_reg(self.power_kw, 10.0)
        regs[2] = self._to_reg(self.irradiance_wm2, 10.0)
        regs[3] = self._to_reg(self.cell_temp_c, 10.0)
        regs[4] = self._to_reg(self.ambient_temp_c, 10.0)
        regs[5] = self._to_reg(self.voltage_v, 10.0)
        regs[6] = self._to_reg(self.current_a, 10.0)
        regs[7] = self._to_reg(self.power_limit_ratio * 100.0, 1.0)
        regs[8] = self._to_reg(self.daily_energy_kwh, 10.0)
        regs[9] = self._to_reg(self.rated_power_kw, 10.0)

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
            elif addr == 7:
                ratio = val / 100.0
                self.power_limit_ratio = max(0.0, min(1.0, ratio))
