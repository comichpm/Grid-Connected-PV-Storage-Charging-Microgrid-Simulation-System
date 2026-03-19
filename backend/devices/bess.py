"""Battery Energy Storage System (BESS) device simulator."""

import logging
from typing import Dict, Any, List

from .base_device import BaseDevice

logger = logging.getLogger(__name__)

# Control mode constants
MODE_STANDBY = 0
MODE_CHARGE = 1
MODE_DISCHARGE = 2


class BESSDevice(BaseDevice):
    """Simulates a battery energy storage system.

    Power convention:
      +kW  → charging (consuming from grid/PV)
      -kW  → discharging (supplying to loads)
    """

    # Voltage vs SOC table (linear interpolation)
    SOC_V_MIN = 600.0   # V at min SOC
    SOC_V_MAX = 800.0   # V at max SOC

    # CC-CV transition SOC thresholds
    CV_UPPER_SOC = 85.0   # Start CV (charging)
    CV_LOWER_SOC = 15.0   # Start CV (discharging)

    def __init__(self, device_id: str, name: str, config: Dict[str, Any],
                 modbus_port: int, modbus_slave_id: int):
        super().__init__(device_id, name, "bess", config, modbus_port, modbus_slave_id)

        self.rated_power_kw: float = config.get("rated_power_kw", 100.0)
        self.capacity_kwh: float = config.get("capacity_kwh", 200.0)
        self.min_soc: float = config.get("min_soc", 10.0)
        self.max_soc: float = config.get("max_soc", 90.0)
        self.charge_efficiency: float = config.get("charge_efficiency", 0.95)
        self.discharge_efficiency: float = config.get("discharge_efficiency", 0.95)
        self.nominal_voltage_v: float = config.get("nominal_voltage_v", 700.0)

        self.soc: float = config.get("initial_soc", 50.0)
        self.control_mode: int = MODE_STANDBY
        self.power_setpoint_kw: float = 0.0    # requested power (+ charge / - discharge)

        self.battery_temp_c: float = 25.0
        self.ambient_temp_c: float = 25.0

        self.total_charge_kwh: float = 0.0
        self.total_discharge_kwh: float = 0.0
        self.cycle_count: float = 0.0          # cumulative half-cycles

        self._prev_energy_kwh: float = self.capacity_kwh * self.soc / 100.0
        self._charge_accum: float = 0.0        # for cycle counting

        self.voltage_v = self._soc_to_voltage(self.soc)
        self.current_a = 0.0

    def _soc_to_voltage(self, soc: float) -> float:
        frac = (soc - self.min_soc) / max(1.0, self.max_soc - self.min_soc)
        frac = max(0.0, min(1.0, frac))
        return self.SOC_V_MIN + frac * (self.SOC_V_MAX - self.SOC_V_MIN)

    def _apply_cc_cv(self, requested_kw: float) -> float:
        """Apply CC-CV derating near upper/lower SOC limits."""
        if requested_kw > 0:  # Charging
            if self.soc >= self.max_soc:
                return 0.0
            if self.soc >= self.CV_UPPER_SOC:
                ratio = (self.max_soc - self.soc) / max(0.1, self.max_soc - self.CV_UPPER_SOC)
                return requested_kw * max(0.05, min(1.0, ratio))
        elif requested_kw < 0:  # Discharging
            if self.soc <= self.min_soc:
                return 0.0
            if self.soc <= self.CV_LOWER_SOC:
                ratio = (self.soc - self.min_soc) / max(0.1, self.CV_LOWER_SOC - self.min_soc)
                return requested_kw * max(0.05, min(1.0, ratio))
        return requested_kw

    def update(self, sim_time_hours: float, dt_seconds: float) -> None:
        dt_hours = dt_seconds / 3600.0

        if not self.online or self.control_mode == MODE_STANDBY:
            self.power_kw = 0.0
            self.current_a = 0.0
            # Cool down slowly
            self.battery_temp_c += (self.ambient_temp_c - self.battery_temp_c) * 0.01
            return

        # Clamp setpoint to rated power
        if self.control_mode == MODE_CHARGE:
            requested = min(abs(self.power_setpoint_kw), self.rated_power_kw)
        else:
            requested = -min(abs(self.power_setpoint_kw), self.rated_power_kw)

        # CC-CV derating
        actual_kw = self._apply_cc_cv(requested)
        self.power_kw = actual_kw

        # SOC update
        if actual_kw > 0:  # Charging
            energy_in = actual_kw * dt_hours * self.charge_efficiency
            self.soc += (energy_in / self.capacity_kwh) * 100.0
            self.total_charge_kwh += energy_in
            self._charge_accum += energy_in
        elif actual_kw < 0:  # Discharging
            energy_out = abs(actual_kw) * dt_hours / self.discharge_efficiency
            self.soc -= (energy_out / self.capacity_kwh) * 100.0
            self.total_discharge_kwh += abs(actual_kw) * dt_hours
            if self._charge_accum > 0:
                self.cycle_count += self._charge_accum / self.capacity_kwh * 0.5
                self._charge_accum = 0.0

        self.soc = max(0.0, min(100.0, self.soc))

        # Update voltage and current
        self.voltage_v = self._soc_to_voltage(self.soc)
        if self.voltage_v > 0:
            self.current_a = (abs(actual_kw) * 1000.0) / self.voltage_v
        if actual_kw < 0:
            self.current_a = -self.current_a

        # Temperature model: rises with power, decays to ambient
        heat_kw = abs(actual_kw) * (1.0 - self.charge_efficiency)
        self.battery_temp_c += heat_kw * dt_hours * 2.0
        self.battery_temp_c += (self.ambient_temp_c - self.battery_temp_c) * 0.005

    def get_state_dict(self) -> Dict[str, Any]:
        return {
            "id": self.device_id,
            "name": self.name,
            "device_type": "bess",
            "online": self.online,
            "power_kw": round(self.power_kw, 3),
            "control_mode": self.control_mode,
            "power_setpoint_kw": round(self.power_setpoint_kw, 3),
            "soc": round(self.soc, 2),
            "min_soc": self.min_soc,
            "max_soc": self.max_soc,
            "voltage_v": round(self.voltage_v, 1),
            "current_a": round(self.current_a, 2),
            "battery_temp_c": round(self.battery_temp_c, 1),
            "charge_efficiency": self.charge_efficiency,
            "discharge_efficiency": self.discharge_efficiency,
            "total_charge_kwh": round(self.total_charge_kwh, 3),
            "total_discharge_kwh": round(self.total_discharge_kwh, 3),
            "cycle_count": round(self.cycle_count, 2),
            "rated_power_kw": self.rated_power_kw,
            "capacity_kwh": self.capacity_kwh,
        }

    def _build_registers(self) -> None:
        regs = self._registers
        # 0: online (0/1)
        # 1: control mode (0=standby,1=charge,2=discharge)
        # 2: power setpoint kW ×10 (signed)
        # 3: actual power kW ×10 (signed)
        # 4: SOC ×10
        # 5: min SOC ×10
        # 6: max SOC ×10
        # 7: voltage V ×10
        # 8: current A ×10 (signed, + charge / - discharge)
        # 9: battery temperature ×10
        # 10: charge efficiency ×1000
        # 11: discharge efficiency ×1000
        # 12: total charge kWh (integer)
        # 13: total discharge kWh (integer)
        # 14: cycle count ×10
        # 15: rated power kW ×10
        # 16: capacity kWh ×10
        regs[0] = 1 if self.online else 0
        regs[1] = self.control_mode
        regs[2] = self._signed_to_reg(self.power_setpoint_kw, 10.0)
        regs[3] = self._signed_to_reg(self.power_kw, 10.0)
        regs[4] = self._to_reg(self.soc, 10.0)
        regs[5] = self._to_reg(self.min_soc, 10.0)
        regs[6] = self._to_reg(self.max_soc, 10.0)
        regs[7] = self._to_reg(self.voltage_v, 10.0)
        regs[8] = self._signed_to_reg(self.current_a, 10.0)
        regs[9] = self._to_reg(self.battery_temp_c, 10.0)
        regs[10] = self._to_reg(self.charge_efficiency, 1000.0)
        regs[11] = self._to_reg(self.discharge_efficiency, 1000.0)
        regs[12] = int(self.total_charge_kwh)
        regs[13] = int(self.total_discharge_kwh)
        regs[14] = self._to_reg(self.cycle_count, 10.0)
        regs[15] = self._to_reg(self.rated_power_kw, 10.0)
        regs[16] = self._to_reg(self.capacity_kwh, 10.0)

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
                if not self.online:
                    self.control_mode = MODE_STANDBY
            elif addr == 1:
                if val in (MODE_STANDBY, MODE_CHARGE, MODE_DISCHARGE):
                    self.control_mode = val
            elif addr == 2:
                sp = self._from_signed_reg(val, 10.0)
                self.power_setpoint_kw = sp

    def get_register_table(self):
        """Return the full Modbus holding-register point table for BESSDevice."""
        self._build_registers()
        r = self._registers

        def _rv(raw, scale, signed=False):
            if signed:
                v = raw if raw < 0x8000 else raw - 0x10000
                return f"{v / scale:.3g}"
            return f"{raw / scale:.3g}"

        defs = [
            (0,  "在线状态",     "R/W", "UINT16", 1,     "",    "0=离线, 1=在线"),
            (1,  "控制模式",     "R/W", "UINT16", 1,     "",    "0=待机, 1=充电, 2=放电"),
            (2,  "功率设定值",   "R/W", "INT16",  10,    "kW",  "+充电 / -放电"),
            (3,  "实时功率",     "R",   "INT16",  10,    "kW",  "+充电 / -放电"),
            (4,  "SOC",         "R",   "UINT16", 10,    "%",   "荷电状态"),
            (5,  "最低SOC",     "R/W", "UINT16", 10,    "%",   "放电截止"),
            (6,  "最高SOC",     "R/W", "UINT16", 10,    "%",   "充电截止"),
            (7,  "端口电压",     "R",   "UINT16", 10,    "V",   ""),
            (8,  "充放电电流",   "R",   "INT16",  10,    "A",   "+充电 / -放电"),
            (9,  "电池温度",     "R",   "UINT16", 10,    "°C",  ""),
            (10, "充电效率",     "R",   "UINT16", 1000,  "",    "如 950 = 95.0%"),
            (11, "放电效率",     "R",   "UINT16", 1000,  "",    "如 950 = 95.0%"),
            (12, "累计充电量",   "R",   "UINT16", 1,     "kWh", "整数"),
            (13, "累计放电量",   "R",   "UINT16", 1,     "kWh", "整数"),
            (14, "等效循环次数", "R",   "UINT16", 10,    "次",  ""),
            (15, "额定功率",     "R",   "UINT16", 10,    "kW",  ""),
            (16, "电池容量",     "R",   "UINT16", 10,    "kWh", ""),
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
