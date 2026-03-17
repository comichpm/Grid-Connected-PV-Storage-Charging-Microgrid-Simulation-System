"""Modbus server manager – TCP and RTU (serial) per device.

Each device can independently use Modbus TCP or Modbus RTU (serial).
RTU requires a real or virtual serial port (e.g. /dev/ttyUSB0 or
socat-created pseudo-tty pairs for testing).
"""

import asyncio
import logging
from typing import Dict, Optional

from pymodbus.datastore import (
    ModbusSequentialDataBlock,
    ModbusDeviceContext,
    ModbusServerContext,
)
from pymodbus.server import StartAsyncTcpServer
from pymodbus import ModbusDeviceIdentification

logger = logging.getLogger(__name__)

# Try to import serial server (requires pyserial)
try:
    from pymodbus.server import StartAsyncSerialServer
    _SERIAL_AVAILABLE = True
except ImportError:
    _SERIAL_AVAILABLE = False
    logger.warning("pymodbus serial server not available – RTU mode will be disabled")


def _build_context(device_ref, slave_id: int):
    """Create a Modbus server context with 100 holding registers for a device."""
    datablock = ModbusSequentialDataBlock(0, [0] * 100)
    device_ctx = ModbusDeviceContext(hr=datablock)
    device_ref.set_modbus_datablock(datablock)
    return ModbusServerContext(devices={slave_id: device_ctx}, single=False), datablock


def _build_identity(device_id: str, device_name: str) -> ModbusDeviceIdentification:
    identity = ModbusDeviceIdentification()
    identity.VendorName = "MicrogridSim"
    identity.ProductCode = device_id
    identity.ProductName = device_name
    return identity


class DeviceModbusServer:
    """Manages a single async Modbus server (TCP or RTU) for one device."""

    def __init__(self, device_id: str, device_ref, host: str = "0.0.0.0"):
        self.device_id = device_id
        self.device_ref = device_ref
        self.host = host

        self._task: Optional[asyncio.Task] = None
        self._datablock: Optional[ModbusSequentialDataBlock] = None

    async def start(self) -> None:
        if self._task is not None:
            return

        mode = getattr(self.device_ref, "modbus_mode", "tcp")
        context, self._datablock = _build_context(self.device_ref, self.device_ref.modbus_slave_id)
        identity = _build_identity(self.device_id, self.device_ref.name)

        if mode == "rtu":
            await self._start_rtu(context, identity)
        else:
            await self._start_tcp(context, identity)

    async def _start_tcp(self, context, identity) -> None:
        port = self.device_ref.modbus_port

        async def _run():
            try:
                await StartAsyncTcpServer(
                    context=context,
                    identity=identity,
                    address=(self.host, port),
                )
            except asyncio.CancelledError:
                pass
            except Exception as exc:  # noqa: BLE001
                logger.warning("Modbus TCP server %s on port %d error: %s",
                               self.device_id, port, exc)

        self._task = asyncio.ensure_future(_run())
        logger.info("Modbus TCP server started for device %s on %s:%d (slave=%d)",
                    self.device_id, self.host, port, self.device_ref.modbus_slave_id)

    async def _start_rtu(self, context, identity) -> None:
        if not _SERIAL_AVAILABLE:
            logger.error(
                "RTU requested for device %s but pymodbus serial server is not available",
                self.device_id,
            )
            return

        serial_port = getattr(self.device_ref, "modbus_serial_port", "/dev/ttyUSB0")
        baud_rate = getattr(self.device_ref, "modbus_baud_rate", 9600)
        parity = getattr(self.device_ref, "modbus_parity", "N")
        stopbits = getattr(self.device_ref, "modbus_stopbits", 1)
        bytesize = getattr(self.device_ref, "modbus_bytesize", 8)

        async def _run():
            try:
                await StartAsyncSerialServer(
                    context=context,
                    identity=identity,
                    port=serial_port,
                    baudrate=baud_rate,
                    parity=parity,
                    stopbits=stopbits,
                    bytesize=bytesize,
                    framer="rtu",
                    timeout=1,
                )
            except asyncio.CancelledError:
                pass
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Modbus RTU server %s on %s error: %s",
                    self.device_id, serial_port, exc,
                )

        self._task = asyncio.ensure_future(_run())
        logger.info(
            "Modbus RTU server started for device %s on %s (baud=%d, slave=%d)",
            self.device_id, serial_port, baud_rate, self.device_ref.modbus_slave_id,
        )

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._task = None
            self.device_ref.set_modbus_datablock(None)
            logger.info("Modbus server stopped for device %s", self.device_id)

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()


class ModbusServerManager:
    """Manages all per-device Modbus servers (TCP + RTU)."""

    def __init__(self, host: str = "0.0.0.0"):
        self.host = host
        self._servers: Dict[str, DeviceModbusServer] = {}

    async def add_device(self, device) -> None:
        if device.device_id in self._servers:
            await self.remove_device(device.device_id)

        server = DeviceModbusServer(
            device_id=device.device_id,
            device_ref=device,
            host=self.host,
        )
        self._servers[device.device_id] = server
        await server.start()
        await asyncio.sleep(0.05)

    async def remove_device(self, device_id: str) -> None:
        server = self._servers.pop(device_id, None)
        if server:
            await server.stop()

    async def update_device(self, device) -> None:
        await self.remove_device(device.device_id)
        await self.add_device(device)

    async def stop_all(self) -> None:
        for device_id in list(self._servers.keys()):
            await self.remove_device(device_id)

    def get_server(self, device_id: str) -> Optional[DeviceModbusServer]:
        return self._servers.get(device_id)
