"""PV Inverter device simulator."""

import math
import random
import logging
from typing import Dict, Any, List, Optional

from .base_device import BaseDevice

logger = logging.getLogger(__name__)

# Weather mode constants (Req 6)
WEATHER_SUNNY = "sunny"
WEATHER_PARTLY_CLOUDY = "partly_cloudy"
WEATHER_CLOUDY = "cloudy"
WEATHER_RAINY = "rainy"
WEATHER_SNOWY = "snowy"
WEATHER_FOGGY = "foggy"
WEATHER_CUSTOM = "custom"

# Irradiance fraction for each weather condition
WEATHER_IRRADIANCE_FACTORS = {
    WEATHER_SUNNY:        1.00,
    WEATHER_PARTLY_CLOUDY: 0.65,
    WEATHER_CLOUDY:       0.30,
    WEATHER_RAINY:        0.15,
    WEATHER_SNOWY:        0.20,   # snow reflects; panel may be covered
    WEATHER_FOGGY:        0.25,
    WEATHER_CUSTOM:       1.00,   # factor applied from custom_irr_factor
}

# Ambient temperature offsets (deg C) relative to standard 25 deg C
WEATHER_TEMP_OFFSETS = {
    WEATHER_SUNNY:        5.0,
    WEATHER_PARTLY_CLOUDY: 2.0,
    WEATHER_CLOUDY:       0.0,
    WEATHER_RAINY:        -5.0,
    WEATHER_SNOWY:        -15.0,
    WEATHER_FOGGY:        -2.0,
    WEATHER_CUSTOM:       0.0,
}

# Additional random fluctuation amplitude per weather type
WEATHER_FLUCTUATION = {
    WEATHER_SUNNY:        0.05,
    WEATHER_PARTLY_CLOUDY: 0.20,
    WEATHER_CLOUDY:       0.15,
    WEATHER_RAINY:        0.25,
    WEATHER_SNOWY:        0.10,
    WEATHER_FOGGY:        0.12,
    WEATHER_CUSTOM:       0.05,
}

ALL_WEATHER_MODES = [
    WEATHER_SUNNY, WEATHER_PARTLY_CLOUDY, WEATHER_CLOUDY,
    WEATHER_RAINY, WEATHER_SNOWY, WEATHER_FOGGY, WEATHER_CUSTOM,
]


class PVDevice(BaseDevice):
    """Simulates a photovoltaic inverter.

    Power convention: power_kw is NEGATIVE (generation -> injected to grid).
    """

    SUNRISE_H = 6.0
    SUNSET_H = 18.0
    SOLAR_PEAK_H = 12.0
    SOLAR_SIGMA = 2.5
    MAX_IRRADIANCE = 1000.0  # W/m2

    def __init__(self, device_id: str, name: str, config: Dict[str, Any],
                 modbus_port: int, modbus_slave_id: int):
        super().__init__(device_id, name, "pv", config, modbus_port, modbus_slave_id)

        self.rated_power_kw: float = config.get("rated_power_kw", 100.0)
        self.panel_area_m2: float = config.get("panel_area_m2", 500.0)
        self.efficiency: float = config.get("efficiency", 0.20)
        self.temp_coefficient: float = config.get("temp_coefficient", -0.004)
        self.noct_temp: float = config.get("noct_temp", 45.0)

        # Weather (Req 6)
        self.weather_mode: str = config.get("weather_mode", WEATHER_SUNNY)
        self.custom_irr_factor: float = config.get("custom_irr_factor", 1.0)

        # Configurable sunrise/sunset (Req 6)
        self.sunrise_h: float = config.get("sunrise_h", self.SUNRISE_H)
        self.sunset_h: float = config.get("sunset_h", self.SUNSET_H)
        self.peak_h: float = config.get("peak_h", self.SOLAR_PEAK_H)

        # Custom power-curve: list of [hour, fraction] pairs (Req 6)
        # e.g. [[6,0],[8,0.4],[12,1.0],[16,0.5],[18,0]]
        self.custom_curve: List[List[float]] = config.get("custom_curve", [])

        self.irradiance_wm2: float = 0.0
        self.cell_temp_c: float = 25.0
        self.ambient_temp_c: float = 25.0
        self.daily_energy_kwh: float = 0.0
        self.power_limit_ratio: float = 1.0
        self._last_day: int = 0
        self._fluctuation_offset: float = 0.0

        self.voltage_v = 600.0

    def _calc_base_irradiance(self, hour: float) -> float:
        """Compute clear-sky irradiance for the given hour."""
        if hour < self.sunrise_h or hour > self.sunset_h:
            return 0.0
        peak_h = self.peak_h
        sigma = (self.sunset_h - self.sunrise_h) / 6.0
        gauss = math.exp(-((hour - peak_h) ** 2) / (2.0 * sigma ** 2))
        return self.MAX_IRRADIANCE * gauss

    def _interpolate_custom_curve(self, hour: float) -> float:
        """Interpolate a user-defined (hour, fraction) power curve."""
        pts = sorted(self.custom_curve, key=lambda p: p[0])
        if not pts:
            return self._calc_base_irradiance(hour) / self.MAX_IRRADIANCE
        if hour <= pts[0][0]:
            return pts[0][1]
        if hour >= pts[-1][0]:
            return pts[-1][1]
        for i in range(len(pts) - 1):
            h0, f0 = pts[i]
            h1, f1 = pts[i + 1]
            if h0 <= hour <= h1:
                t = (hour - h0) / max(1e-6, h1 - h0)
                return f0 + t * (f1 - f0)
        return 0.0

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

        # Base irradiance
        if self.weather_mode == WEATHER_CUSTOM and self.custom_curve:
            base_fraction = self._interpolate_custom_curve(hour_of_day)
            base_irradiance = base_fraction * self.MAX_IRRADIANCE
        else:
            base_irradiance = self._calc_base_irradiance(hour_of_day)

        # Apply weather factor (Req 6)
        if self.weather_mode == WEATHER_CUSTOM:
            weather_factor = self.custom_irr_factor
        else:
            weather_factor = WEATHER_IRRADIANCE_FACTORS.get(self.weather_mode, 1.0)

        # Random cloud-shadow fluctuation
        fluc_amp = WEATHER_FLUCTUATION.get(self.weather_mode, 0.05)
        self._fluctuation_offset += random.gauss(0, fluc_amp * dt_seconds * 0.1)
        self._fluctuation_offset = max(-fluc_amp, min(fluc_amp, self._fluctuation_offset))
        net_factor = max(0.0, weather_factor + self._fluctuation_offset)

        self.irradiance_wm2 = max(0.0, base_irradiance * net_factor)

        # Ambient temperature adjusted for weather (Req 6)
        temp_offset = WEATHER_TEMP_OFFSETS.get(self.weather_mode, 0.0)
        self.ambient_temp_c = 25.0 + temp_offset

        # Snow coverage: if snowy, additional efficiency reduction
        snow_factor = 0.6 if self.weather_mode == WEATHER_SNOWY else 1.0

        # Cell temperature
        self.cell_temp_c = self.ambient_temp_c + (self.irradiance_wm2 / 800.0) * (
            self.noct_temp - 20.0
        )

        # Temperature-corrected efficiency
        temp_factor = 1.0 + self.temp_coefficient * (self.cell_temp_c - 25.0)
        effective_eff = self.efficiency * max(0.5, temp_factor) * snow_factor

        raw_power_kw = (self.irradiance_wm2 * self.panel_area_m2 * effective_eff) / 1000.0
        limited_power_kw = min(raw_power_kw, self.rated_power_kw * self.power_limit_ratio)
        limited_power_kw = max(0.0, limited_power_kw)

        self.power_kw = -limited_power_kw  # negative = generation

        if self.irradiance_wm2 > 0:
            self.daily_energy_kwh += limited_power_kw * dt_hours

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
            "weather_mode": self.weather_mode,
            "custom_irr_factor": self.custom_irr_factor,
            "sunrise_h": self.sunrise_h,
            "sunset_h": self.sunset_h,
        }

    def _build_registers(self) -> None:
        weather_idx = ALL_WEATHER_MODES.index(self.weather_mode) if self.weather_mode in ALL_WEATHER_MODES else 0
        regs = self._registers
        # 0: online (0/1)
        # 1: power kW x10 (signed, negative = generation)
        # 2: irradiance W/m2 x10
        # 3: cell temperature x10
        # 4: ambient temperature x10
        # 5: voltage V x10
        # 6: current A x10
        # 7: power limit ratio x100 (0-100)
        # 8: daily energy kWh x10
        # 9: rated power kW x10
        # 10: weather mode index (0-6)
        # 11: custom irradiance factor x100
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
        regs[10] = weather_idx
        regs[11] = self._to_reg(self.custom_irr_factor, 100.0)

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
            elif addr == 7:
                ratio = val / 100.0
                self.power_limit_ratio = max(0.0, min(1.0, ratio))
            elif addr == 10:
                if 0 <= val < len(ALL_WEATHER_MODES):
                    self.weather_mode = ALL_WEATHER_MODES[val]
            elif addr == 11:
                self.custom_irr_factor = max(0.0, min(2.0, val / 100.0))

    def get_register_table(self):
        """Return the full Modbus holding-register point table for PVDevice."""
        self._build_registers()
        r = self._registers

        def _rv(raw, scale, signed=False):
            if signed:
                v = raw if raw < 0x8000 else raw - 0x10000
                return f"{v / scale:.3g}"
            return f"{raw / scale:.3g}"

        weather_names = ["晴天", "多云", "阴天", "雨天", "雪天", "雾天", "自定义"]

        defs = [
            (0,  "在线状态",       "R/W", "UINT16", 1,     "",      "0=离线, 1=在线"),
            (1,  "实时功率",       "R",   "INT16",  10,    "kW",    "负值=发电"),
            (2,  "辐照度",         "R",   "UINT16", 10,    "W/m²",  ""),
            (3,  "电池温度",       "R",   "UINT16", 10,    "°C",    "组件电池温度"),
            (4,  "环境温度",       "R",   "UINT16", 10,    "°C",    ""),
            (5,  "直流电压",       "R",   "UINT16", 10,    "V",     ""),
            (6,  "直流电流",       "R",   "UINT16", 10,    "A",     ""),
            (7,  "功率限制比例",   "R/W", "UINT16", 1,     "%",     "0-100，写入限制最大出力"),
            (8,  "日发电量",       "R",   "UINT16", 10,    "kWh",   "每天复位"),
            (9,  "额定功率",       "R",   "UINT16", 10,    "kW",    ""),
            (10, "天气模式",       "R/W", "UINT16", 1,     "",      f"0=晴天…6=自定义; 当前={weather_names[r[10]] if r[10] < len(weather_names) else r[10]}"),
            (11, "自定义辐照因子", "R/W", "UINT16", 100,   "",      "天气=自定义时有效，0-200"),
        ]
        table = []
        for addr, name, access, dtype, scale, unit, desc in defs:
            raw = r[addr]
            signed = (dtype == "INT16")
            table.append({
                "address": addr,
                "name": name,
                "access": access,
                "data_type": dtype,
                "scale": scale,
                "unit": unit,
                "raw": raw,
                "value": _rv(raw, scale, signed),
                "description": desc,
            })
        return table
