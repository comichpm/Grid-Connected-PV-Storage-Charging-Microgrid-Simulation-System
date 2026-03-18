"""Simulation engine - main async loop."""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Tuple, Callable, Awaitable, Any, Optional

from backend.config import (
    SIMULATION_STEP_SECONDS,
    SIMULATION_MIN_STEP_SECONDS,
    SIMULATION_MAX_STEP_SECONDS,
    SIMULATION_SPEED_MULTIPLIER,
    SIMULATION_START_HOUR,
    TOPOLOGY_FILE,
)
from backend.devices.base_device import BaseDevice
from backend.engine.power_balance import calculate_power_balance

logger = logging.getLogger(__name__)

SIM_STATE_STOPPED = "stopped"
SIM_STATE_RUNNING = "running"
SIM_STATE_PAUSED = "paused"


class SimulationEngine:
    """Drives the microgrid simulation loop.

    The engine:
    1. Advances simulation time.
    2. Updates all non-grid devices.
    3. Runs power balance -> sets grid power.
    4. Updates grid device.
    5. Syncs Modbus registers for all devices.
    6. Calls registered WebSocket broadcast callbacks.
    """

    def __init__(self):
        self.state: str = SIM_STATE_STOPPED
        self.sim_time_hours: float = SIMULATION_START_HOUR
        self.speed_multiplier: float = SIMULATION_SPEED_MULTIPLIER
        self.step_seconds: float = SIMULATION_STEP_SECONDS  # real-time cadence

        self.devices: Dict[str, BaseDevice] = {}
        self._ws_callbacks: List[Callable[[Dict[str, Any]], Awaitable[None]]] = []
        self._task: Optional[asyncio.Task] = None

        # Topology edges from the ReactFlow canvas: list of (source_id, target_id)
        self.topology_edges: List[Tuple[str, str]] = []

        self._total_steps: int = 0
        self._real_start_time: float = 0.0

    # ------------------------------------------------------------------
    # Device management
    # ------------------------------------------------------------------

    def add_device(self, device: BaseDevice) -> None:
        self.devices[device.device_id] = device
        # Wire smart meter to devices registry
        self._wire_smart_meters()

    def remove_device(self, device_id: str) -> None:
        self.devices.pop(device_id, None)
        self._wire_smart_meters()

    def _wire_smart_meters(self) -> None:
        """Give each smart meter a reference to the devices dict."""
        for device in self.devices.values():
            if device.device_type == "smart_meter":
                device.set_devices_registry(self.devices)  # type: ignore[attr-defined]

    # ------------------------------------------------------------------
    # Topology management
    # ------------------------------------------------------------------

    def update_topology(self, edges: List[Tuple[str, str]]) -> None:
        """Update the topology edge list used by the power balance engine.

        Args:
            edges: List of (source_device_id, target_device_id) tuples
                   representing the connections drawn on the canvas.
        """
        self.topology_edges = list(edges)
        logger.info(
            "Topology updated: %d edge(s) – multi-bus power balance active",
            len(self.topology_edges),
        )

    def load_topology_from_file(self) -> None:
        """Load persisted topology edges from the topology JSON file.

        Called during application startup so the engine immediately knows
        about any topology that was saved in a previous session.
        """
        topo_path = Path(TOPOLOGY_FILE)
        if not topo_path.exists():
            return
        try:
            with topo_path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
            raw_edges = data.get("edges", [])
            edges: List[Tuple[str, str]] = [
                (e["source"], e["target"]) for e in raw_edges
                if "source" in e and "target" in e
            ]
            self.update_topology(edges)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not load topology from file: %s", exc)

    def get_device(self, device_id: str) -> Optional[BaseDevice]:
        return self.devices.get(device_id)

    def update_device_config(self, device_id: str, config: Dict[str, Any]) -> None:
        device = self.devices.get(device_id)
        if device is not None:
            device.config.update(config)
            # Use the device's apply_config_update for proper type coercion
            # and device-specific field mapping (e.g. EV charger aliases).
            device.apply_config_update(config)
            # Re-wire smart meters in case monitored_device_ids changed
            if device.device_type == "smart_meter":
                self._wire_smart_meters()

    # ------------------------------------------------------------------
    # WebSocket callback registration
    # ------------------------------------------------------------------

    def register_ws_callback(
        self, cb: Callable[[Dict[str, Any]], Awaitable[None]]
    ) -> None:
        if cb not in self._ws_callbacks:
            self._ws_callbacks.append(cb)

    def unregister_ws_callback(
        self, cb: Callable[[Dict[str, Any]], Awaitable[None]]
    ) -> None:
        self._ws_callbacks = [c for c in self._ws_callbacks if c is not cb]

    # ------------------------------------------------------------------
    # Control
    # ------------------------------------------------------------------

    async def start(self) -> None:
        if self.state == SIM_STATE_RUNNING:
            return
        if self.state == SIM_STATE_STOPPED:
            self.sim_time_hours = SIMULATION_START_HOUR
            self._total_steps = 0
            self._real_start_time = time.monotonic()
        self.state = SIM_STATE_RUNNING
        self._task = asyncio.ensure_future(self._loop())
        logger.info("Simulation started (step=%.2fs speed=%.1fx)", self.step_seconds, self.speed_multiplier)

    async def pause(self) -> None:
        if self.state == SIM_STATE_RUNNING:
            self.state = SIM_STATE_PAUSED
            if self._task:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
            logger.info("Simulation paused")

    async def resume(self) -> None:
        if self.state == SIM_STATE_PAUSED:
            self.state = SIM_STATE_RUNNING
            self._task = asyncio.ensure_future(self._loop())
            logger.info("Simulation resumed")

    async def stop(self) -> None:
        self.state = SIM_STATE_STOPPED
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self.sim_time_hours = SIMULATION_START_HOUR
        logger.info("Simulation stopped")

    def set_speed(self, multiplier: float) -> None:
        self.speed_multiplier = max(1.0, min(3600.0, multiplier))

    def set_step(self, seconds: float) -> None:
        """Set the real-time update interval (Req 9 – supports down to 100 ms)."""
        self.step_seconds = max(SIMULATION_MIN_STEP_SECONDS,
                                min(SIMULATION_MAX_STEP_SECONDS, seconds))
        logger.info("Simulation step set to %.2f s", self.step_seconds)

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        try:
            while self.state == SIM_STATE_RUNNING:
                loop_start = asyncio.get_event_loop().time()

                # sim time advance = step * speed (in sim-seconds)
                sim_dt = self.step_seconds * self.speed_multiplier

                await self._step(sim_dt)

                self._total_steps += 1
                self.sim_time_hours += sim_dt / 3600.0

                # Keep sim_time_hours cycling over 24h
                if self.sim_time_hours >= 24.0:
                    self.sim_time_hours -= 24.0

                elapsed = asyncio.get_event_loop().time() - loop_start
                sleep_time = max(0.0, self.step_seconds - elapsed)
                await asyncio.sleep(sleep_time)
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa: BLE001
            logger.exception("Simulation loop error")

    async def _step(self, sim_dt_seconds: float) -> None:
        device_list = list(self.devices.values())

        # 1. Update all non-grid, non-smart-meter devices
        for device in device_list:
            if device.device_type not in ("grid", "smart_meter"):
                device.update(self.sim_time_hours, sim_dt_seconds)

        # 2. Calculate power balance and update grid
        _, power_summary = calculate_power_balance(device_list, self.topology_edges)

        # 3. Update grid device state (totals/protection)
        for device in device_list:
            if device.device_type == "grid":
                device.update(self.sim_time_hours, sim_dt_seconds)

        # 4. Update smart meters (after all devices have their final power_kw)
        for device in device_list:
            if device.device_type == "smart_meter":
                device.update(self.sim_time_hours, sim_dt_seconds)

        # 5. Sync all Modbus registers
        for device in device_list:
            device.sync_modbus_registers()

        # 6. Broadcast via WebSocket
        if self._ws_callbacks:
            payload = self._build_ws_payload(device_list, power_summary)
            for cb in list(self._ws_callbacks):
                try:
                    await cb(payload)
                except Exception:  # noqa: BLE001
                    logger.debug("WS callback error", exc_info=True)

    def _build_ws_payload(
        self,
        devices: List[BaseDevice],
        power_summary: Dict[str, Any],
    ) -> Dict[str, Any]:
        return {
            "type": "simulation_update",
            "timestamp": time.time(),
            "sim_time_hours": round(self.sim_time_hours, 4),
            "sim_state": self.state,
            "power_balance": power_summary,
            "devices": [d.get_state_dict() for d in devices],
        }

    def get_status(self) -> Dict[str, Any]:
        device_list = list(self.devices.values())
        _, power_summary = calculate_power_balance(device_list, self.topology_edges)
        return {
            "state": self.state,
            "sim_time_hours": round(self.sim_time_hours, 4),
            "speed_multiplier": self.speed_multiplier,
            "step_seconds": self.step_seconds,
            "total_steps": self._total_steps,
            "power_balance": power_summary,
            "devices": [d.get_state_dict() for d in device_list],
        }
