"""Grid (Slack Bus) device simulator."""

import logging
from typing import Dict, Any, List

from .base_device import BaseDevice

logger = logging.getLogger(__name__)


class GridDevice(BaseDevice):
    """Simulates the grid connection point (Slack Bus).

    Power convention:
      +kW  → importing from grid (grid is supplying)
      -kW  → exporting to grid   (grid is absorbing)
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

        self.voltage_v = self.voltage_kv * 1000.0
        self.current_a: float = 0.0

        self.total_import_kwh: float = 0.0
        self.total_export_kwh: float = 0.0

        # Status: 0=offline, 1=importing, 2=exporting, 3=idle
        self.grid_status: int = 3

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

        if self.power_kw > 0:
            # Importing
            self.grid_status = 1
            self.total_import_kwh += self.power_kw * dt_hours
        elif self.power_kw < 0:
            # Exporting
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
            "total_import_kwh": round(self.total_import_kwh, 3),
            "total_export_kwh": round(self.total_export_kwh, 3),
            "import_price": self.import_price,
            "export_price": self.export_price,
            "max_import_kw": self.max_import_kw,
            "max_export_kw": self.max_export_kw,
        }

    def _build_registers(self) -> None:
        # Register map (address → value)
        # 0: online status (0/1)
        # 1: grid status (0=offline,1=import,2=export,3=idle)
        # 2: power kW ×10 (signed)
        # 3: voltage V ×10
        # 4: current A ×10
        # 5: frequency Hz ×100
        # 6: total import kWh (integer)
        # 7: total export kWh (integer)
        # 8: import price ×100
        # 9: export price ×100
        # 10: max import kW ×10
        # 11: max export kW ×10
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

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        """Handle external Modbus write commands."""
        for i, val in enumerate(values):
            addr = address + i
            if addr == 0:
                self.online = bool(val)
            elif addr == 10:
                self.max_import_kw = self._from_reg(val, 10.0)
            elif addr == 11:
                self.max_export_kw = self._from_reg(val, 10.0)
