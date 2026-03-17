"""Base device class - all simulators inherit from this."""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class BaseDevice(ABC):
    """Base class for all device simulators.

    Convention for power sign:
      +kW = consuming power from the grid (loads, EV chargers, BESS charging)
      -kW = producing power to the grid (PV, BESS discharging)

    The Grid device is the Slack Bus and its power is set by the engine
    to balance the system.

    Modbus supports both TCP and RTU (serial) modes, selectable per device.
    """

    def __init__(self, device_id: str, name: str, device_type: str,
                 config: Dict[str, Any], modbus_port: int, modbus_slave_id: int):
        self.device_id = device_id
        self.name = name
        self.device_type = device_type
        self.config = config.copy()
        self.modbus_port = modbus_port
        self.modbus_slave_id = modbus_slave_id

        # Modbus mode: "tcp" or "rtu"
        self.modbus_mode: str = config.get("modbus_mode", "tcp")
        # RTU serial settings (used when modbus_mode == "rtu")
        self.modbus_serial_port: str = config.get("modbus_serial_port", "/dev/ttyUSB0")
        self.modbus_baud_rate: int = int(config.get("modbus_baud_rate", 9600))
        self.modbus_parity: str = config.get("modbus_parity", "N")
        self.modbus_stopbits: int = int(config.get("modbus_stopbits", 1))
        self.modbus_bytesize: int = int(config.get("modbus_bytesize", 8))

        # Common state
        self.online: bool = True
        self.power_kw: float = 0.0        # Current power (kW), sign convention above
        self.voltage_v: float = 0.0
        self.current_a: float = 0.0

        # Modbus holding registers (16-bit unsigned, scaled)
        self._registers: List[int] = [0] * 100

        # Reference to Modbus datablock (set when Modbus server starts)
        self._modbus_datablock = None

        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Subclass interface
    # ------------------------------------------------------------------

    @abstractmethod
    def update(self, sim_time_hours: float, dt_seconds: float) -> None:
        """Update device state for one simulation step.

        Args:
            sim_time_hours: Current simulation time in hours (0..24 cycling)
            dt_seconds:     Simulation time step in seconds
        """

    @abstractmethod
    def get_state_dict(self) -> Dict[str, Any]:
        """Return complete device state as a serialisable dictionary."""

    @abstractmethod
    def _build_registers(self) -> None:
        """Populate self._registers from the current device state."""

    # ------------------------------------------------------------------
    # Modbus helpers
    # ------------------------------------------------------------------

    def set_modbus_datablock(self, datablock) -> None:
        self._modbus_datablock = datablock

    def sync_modbus_registers(self) -> None:
        """Push current state to the Modbus holding-register datablock."""
        self._build_registers()
        if self._modbus_datablock is not None:
            try:
                self._modbus_datablock.setValues(0, self._registers)
            except Exception as exc:  # noqa: BLE001
                logger.debug("Modbus sync error for %s: %s", self.device_id, exc)

    def handle_modbus_write(self, address: int, values: List[int]) -> None:
        """Called when an external Modbus client writes to holding registers.

        Subclasses should override this to handle control commands.
        """

    # ------------------------------------------------------------------
    # Common helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_reg(value: float, scale: float = 10.0) -> int:
        """Convert float to unsigned 16-bit register (multiply by scale)."""
        raw = int(round(value * scale))
        return max(0, min(0xFFFF, raw))

    @staticmethod
    def _signed_to_reg(value: float, scale: float = 10.0) -> int:
        """Convert signed float to 16-bit two's-complement register."""
        raw = int(round(value * scale))
        raw = max(-32768, min(32767, raw))
        return raw & 0xFFFF

    @staticmethod
    def _from_reg(reg_value: int, scale: float = 10.0) -> float:
        return reg_value / scale

    @staticmethod
    def _from_signed_reg(reg_value: int, scale: float = 10.0) -> float:
        if reg_value >= 0x8000:
            reg_value -= 0x10000
        return reg_value / scale
