"""Modbus TCP Server manager – one server per device."""

import asyncio
import logging
from typing import Dict, Optional

from pymodbus.datastore import ModbusSequentialDataBlock, ModbusDeviceContext, ModbusServerContext
from pymodbus.server import StartAsyncTcpServer
from pymodbus import ModbusDeviceIdentification

logger = logging.getLogger(__name__)


class DeviceModbusServer:
    """Manages a single async Modbus TCP server for one device."""

    def __init__(self, device_id: str, host: str, port: int, slave_id: int, device_ref):
        self.device_id = device_id
        self.host = host
        self.port = port
        self.slave_id = slave_id
        self.device_ref = device_ref

        self._task: Optional[asyncio.Task] = None
        self._datablock: Optional[ModbusSequentialDataBlock] = None
        self._context: Optional[ModbusServerContext] = None

    def _build_context(self) -> ModbusServerContext:
        # 100 holding registers starting at address 0
        self._datablock = ModbusSequentialDataBlock(0, [0] * 100)
        device_ctx = ModbusDeviceContext(hr=self._datablock)
        self.device_ref.set_modbus_datablock(self._datablock)
        return ModbusServerContext(devices={self.slave_id: device_ctx}, single=False)

    async def start(self) -> None:
        """Start the Modbus TCP server in a background task."""
        if self._task is not None:
            return

        context = self._build_context()

        identity = ModbusDeviceIdentification()
        identity.VendorName = "MicrogridSim"
        identity.ProductCode = self.device_id
        identity.ProductName = self.device_ref.name

        async def _run():
            try:
                await StartAsyncTcpServer(
                    context=context,
                    identity=identity,
                    address=(self.host, self.port),
                )
            except asyncio.CancelledError:
                pass
            except Exception as exc:  # noqa: BLE001
                logger.warning("Modbus server %s on port %d error: %s",
                               self.device_id, self.port, exc)

        self._task = asyncio.ensure_future(_run())
        logger.info("Modbus TCP server started for device %s on %s:%d (slave=%d)",
                    self.device_id, self.host, self.port, self.slave_id)

    async def stop(self) -> None:
        """Stop the Modbus TCP server."""
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
    """Manages all per-device Modbus TCP servers."""

    def __init__(self, host: str = "0.0.0.0"):
        self.host = host
        self._servers: Dict[str, DeviceModbusServer] = {}

    async def add_device(self, device) -> None:
        """Create and start a Modbus server for the given device."""
        if device.device_id in self._servers:
            await self.remove_device(device.device_id)

        server = DeviceModbusServer(
            device_id=device.device_id,
            host=self.host,
            port=device.modbus_port,
            slave_id=device.modbus_slave_id,
            device_ref=device,
        )
        self._servers[device.device_id] = server
        await server.start()
        # Small delay to allow the socket to bind
        await asyncio.sleep(0.1)

    async def remove_device(self, device_id: str) -> None:
        server = self._servers.pop(device_id, None)
        if server:
            await server.stop()

    async def update_device(self, device) -> None:
        """Restart Modbus server for a device (e.g. port changed)."""
        await self.remove_device(device.device_id)
        await self.add_device(device)

    async def stop_all(self) -> None:
        for device_id in list(self._servers.keys()):
            await self.remove_device(device_id)

    def get_server(self, device_id: str) -> Optional[DeviceModbusServer]:
        return self._servers.get(device_id)
