"""Grid (Slack Bus) device simulator."""

import logging
from typing import Dict, Any, List, Optional

from .base_device import BaseDevice

logger = logging.getLogger(__name__)


class GridDevice(BaseDevice):
    """Simulates the grid connection point (Slack Bus).

    Power convention (Req 1):
      +kW  → grid supplying power to local loads  (import from grid, positive)
      -kW  → local generation exporting to grid   (export to grid,  negative)
    """

    def __init__(self, device_id: str, name: str, config: Dict[str, Any],
                 modbus_port: int, modbus_slave_id: int):
        super().__init__(device_id, name, "grid", config, modbus_port, modbus_slave_id)

        self.max_import_kw: float = config.get("max_import_kw", 1000.0)
        self.max_export_kw: float = config.get("max_export_kw", 1000.0)
        self.voltage_kv: float = config.get("voltage_kv", 10.0)
        self.frequency_hz: float = config.get("frequency_hz", 50.0)
        self.import_price: float = config.get("import_price", 0.85)
        self.export_price: float = config.get("export_price", 0.40)

        # Rated capacity + overload protection (Req 3)
        self.rated_capacity_kw: float = config.get("rated_capacity_kw", 1000.0)
        self.overload_threshold_ratio: float = config.get("overload_threshold_ratio", 1.2)
        self.overload_max_duration_s: float = config.get("overload_max_duration_s", 30.0)
        self.disconnect_on_overload: bool = config.get("disconnect_on_overload", True)
        self._overload_timer_s: float = 0.0   # accumulates while overloaded

        self.voltage_v = self.voltage_kv * 1000.0
        self.current_a: float = 0.0

        self.total_import_kwh: float = 0.0
        self.total_export_kwh: float = 0.0
        self.overload_count: int = 0          # times tripped on overload

        # Status: 0=offline, 1=importing, 2=exporting, 3=idle, 4=overload-trip
        self.grid_status: int = 3

        # Parent grid device ID in a hierarchical multi-bus topology.
        # None = this is the root (or single-bus) grid.
        # Set by power_balance._balance_multi() after each topo sort.
        self.parent_grid_id: Optional[str] = None

    # ------------------------------------------------------------------
    # BaseDevice interface
    # ------------------------------------------------------------------

    def update(self, sim_time_hours: float, dt_seconds: float) -> None:
        """Power is set externally by the power balance engine."""
        if not self.online:
            self.power_kw = 0.0
            self.grid_status = 0
            return

        dt_hours = dt_seconds / 3600.0

        # Overload protection (Req 3)
        overload_limit = self.rated_capacity_kw * self.overload_threshold_ratio
        if abs(self.power_kw) > overload_limit and self.disconnect_on_overload:
            self._overload_timer_s += dt_seconds
            if self._overload_timer_s >= self.overload_max_duration_s:
                logger.warning(
                    "Grid %s: overload %.1f kW > %.1f kW for %.1f s – disconnecting",
                    self.device_id, abs(self.power_kw), overload_limit,
                    self._overload_timer_s,
                )
                self.online = False
                self.power_kw = 0.0
                self.grid_status = 4  # overload trip
                self.overload_count += 1
                self._overload_timer_s = 0.0
                return
        else:
            self._overload_timer_s = max(0.0, self._overload_timer_s - dt_seconds * 0.5)

        if self.power_kw > 0:
            # Importing (grid supplying load)
            self.grid_status = 1
            self.total_import_kwh += self.power_kw * dt_hours
        elif self.power_kw < 0:
            # Exporting (user generation to grid)
            self.grid_status = 2
            self.total_export_kwh += abs(self.power_kw) * dt_hours
        else:
            self.grid_status = 3

        # Calculate current from power and voltage
        if self.voltage_v > 0:
            self.current_a = (abs(self.power_kw) * 1000.0) / (self.voltage_v * 1.732)
        else:
            self.current_a = 0.0

    def get_state_dict(self) -> Dict[str, Any]:
        return {
            "id": self.device_id,
            "name": self.name,
            "device_type": "grid",
            "online": self.online,
            "power_kw": round(self.power_kw, 3),
            "voltage_kv": self.voltage_kv,
            "voltage_v": round(self.voltage_v, 1),
            "current_a": round(self.current_a, 2),
            "frequency_hz": self.frequency_hz,
            "grid_status": self.grid_status,
            "parent_grid_id": self.parent_grid_id,
            "total_import_kwh": round(self.total_import_kwh, 3),
            "total_export_kwh": round(self.total_export_kwh, 3),
            "import_price": self.import_price,
            "export_price": self.export_price,
            "max_import_kw": self.max_import_kw,
            "max_export_kw": self.max_export_kw,
            "rated_capacity_kw": self.rated_capacity_kw,
            "overload_threshold_ratio": self.overload_threshold_ratio,
            "overload_max_duration_s": self.overload_max_duration_s,
            "disconnect_on_overload": self.disconnect_on_overload,
            "overload_timer_s": round(self._overload_timer_s, 2),
            "overload_count": self.overload_count,
        }

    def _build_registers(self) -> None:
        # Register map (address -> value)
        # 0: online status (0/1)
        # 1: grid status (0=offline,1=import,2=export,3=idle,4=overload-trip)
        # 2: power kW x10 (signed, +import -export)
        # 3: voltage V x10
        # 4: current A x10
        # 5: frequency Hz x100
        # 6: total import kWh (integer)
        # 7: total export kWh (integer)
        # 8: import price x100
        # 9: export price x100
        # 10: max import kW x10
        # 11: max export kW x10
        # 12: rated capacity kW x10
        # 13: overload threshold ratio x100
        # 14: overload max duration s x10
        # 15: overload timer s x10
        # 16: overload count
        regs = self._registers
        regs[0] = 1 if self.online else 0
        regs[1] = self.grid_status
        regs[2] = self._signed_to_reg(self.power_kw, 10.0)
        regs[3] = self._to_reg(self.voltage_v, 10.0)
        regs[4] = self._to_reg(self.current_a, 10.0)
        regs[5] = self._to_reg(self.frequency_hz, 100.0)
        regs[6] = int(self.total_import_kwh)
        regs[7] = int(self.total_export_kwh)
        regs[8] = self._to_reg(self.import_price, 100.0)
        regs[9] = self._to_reg(self.export_price, 100.0)
        regs[10] = self._to_reg(self.max_import_kw, 10.0)
        regs[11] = self._to_reg(self.max_export_kw, 10.0)
        regs[12] = self._to_reg(self.rated_capacity_kw, 10.0)
        regs[13] = self._to_reg(self.overload_threshold_ratio, 100.0)
        regs[14] = self._to_reg(self.overload_max_duration_s, 10.0)
        regs[15] = self._to_reg(self._overload_timer_s, 10.0)
        regs[16] = self.overload_count

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        """Handle external Modbus write commands."""
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
                if self.online:
                    self.grid_status = 3
                    self._overload_timer_s = 0.0
            elif addr == 10:
                self.max_import_kw = self._from_reg(val, 10.0)
            elif addr == 11:
                self.max_export_kw = self._from_reg(val, 10.0)
            elif addr == 12:
                self.rated_capacity_kw = self._from_reg(val, 10.0)
            elif addr == 13:
                self.overload_threshold_ratio = self._from_reg(val, 100.0)
            elif addr == 14:
                self.overload_max_duration_s = self._from_reg(val, 10.0)

    def get_register_table(self):
        """Return the full Modbus holding-register point table for GridDevice."""
        self._build_registers()
        r = self._registers

        def _rv(raw, scale, signed=False):
            if signed:
                v = raw if raw < 0x8000 else raw - 0x10000
                return f"{v / scale:.3g}"
            return f"{raw / scale:.3g}"

        defs = [
            (0,  "在线状态",         "R/W", "UINT16", 1,     "",       "0=离线, 1=在线"),
            (1,  "电网状态",         "R",   "UINT16", 1,     "",       "0=离线,1=购电,2=售电,3=空载,4=过载跳闸"),
            (2,  "实时功率",         "R",   "INT16",  10,    "kW",     "+购电 / -售电"),
            (3,  "母线电压",         "R",   "UINT16", 10,    "V",      ""),
            (4,  "线路电流",         "R",   "UINT16", 10,    "A",      "三相等效"),
            (5,  "电网频率",         "R",   "UINT16", 100,   "Hz",     ""),
            (6,  "累计购电量",       "R",   "UINT16", 1,     "kWh",    "整数"),
            (7,  "累计售电量",       "R",   "UINT16", 1,     "kWh",    "整数"),
            (8,  "购电单价",         "R",   "UINT16", 100,   "元/kWh", ""),
            (9,  "售电单价",         "R",   "UINT16", 100,   "元/kWh", ""),
            (10, "最大购电功率",     "R/W", "UINT16", 10,    "kW",     ""),
            (11, "最大售电功率",     "R/W", "UINT16", 10,    "kW",     ""),
            (12, "额定容量",         "R/W", "UINT16", 10,    "kW",     ""),
            (13, "过载阈值比例",     "R/W", "UINT16", 100,   "",       "如 120=1.2×额定"),
            (14, "过载最长持续时间", "R/W", "UINT16", 10,    "s",      ""),
            (15, "过载计时",         "R",   "UINT16", 10,    "s",      "当前过载持续时间"),
            (16, "过载跳闸次数",     "R",   "UINT16", 1,     "次",     ""),
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
