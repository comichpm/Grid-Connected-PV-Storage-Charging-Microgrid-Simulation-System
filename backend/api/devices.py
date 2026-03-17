"""Device CRUD REST API."""

import uuid
import logging
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException, Request

from backend.models.device import DeviceCreate, DeviceUpdate, DeviceResponse
from backend.devices.grid import GridDevice
from backend.devices.pv import PVDevice
from backend.devices.bess import BESSDevice
from backend.devices.ev_charger import EVChargerDevice
from backend.devices.load import LoadDevice
from backend.devices.smart_meter import SmartMeterDevice

router = APIRouter(prefix="/api/devices", tags=["devices"])
logger = logging.getLogger(__name__)

_DEVICE_FACTORIES = {
    "grid": GridDevice,
    "pv": PVDevice,
    "bess": BESSDevice,
    "ev_charger": EVChargerDevice,
    "load": LoadDevice,
    "smart_meter": SmartMeterDevice,
}

# Runtime metadata (position etc.) stored separately from the device objects
_device_meta: Dict[str, Dict[str, Any]] = {}


def _get_engine(request: Request):
    return request.app.state.engine


def _get_modbus_manager(request: Request):
    return request.app.state.modbus_manager


def _device_to_response(device, meta: Dict[str, Any]) -> DeviceResponse:
    return DeviceResponse(
        id=device.device_id,
        name=device.name,
        device_type=device.device_type,
        modbus_port=device.modbus_port,
        modbus_slave_id=device.modbus_slave_id,
        config=device.config,
        position_x=meta.get("position_x", 100.0),
        position_y=meta.get("position_y", 100.0),
        state=device.get_state_dict(),
    )


@router.get("/", response_model=List[DeviceResponse])
async def list_devices(request: Request):
    engine = _get_engine(request)
    result = []
    for device in engine.devices.values():
        meta = _device_meta.get(device.device_id, {})
        result.append(_device_to_response(device, meta))
    return result


@router.post("/", response_model=DeviceResponse, status_code=201)
async def create_device(data: DeviceCreate, request: Request):
    engine = _get_engine(request)
    modbus_manager = _get_modbus_manager(request)

    device_id = str(uuid.uuid4())[:8]
    factory = _DEVICE_FACTORIES.get(data.device_type)
    if factory is None:
        raise HTTPException(status_code=400, detail=f"Unknown device type: {data.device_type}")

    device = factory(
        device_id=device_id,
        name=data.name,
        config=data.config,
        modbus_port=data.modbus_port,
        modbus_slave_id=data.modbus_slave_id,
    )
    engine.add_device(device)

    meta = {"position_x": data.position_x, "position_y": data.position_y}
    _device_meta[device_id] = meta

    try:
        await modbus_manager.add_device(device)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not start Modbus server for %s: %s", device_id, exc)

    return _device_to_response(device, meta)


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(device_id: str, request: Request):
    engine = _get_engine(request)
    device = engine.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    meta = _device_meta.get(device_id, {})
    return _device_to_response(device, meta)


@router.put("/{device_id}", response_model=DeviceResponse)
async def update_device(device_id: str, data: DeviceUpdate, request: Request):
    engine = _get_engine(request)
    modbus_manager = _get_modbus_manager(request)
    device = engine.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    meta = _device_meta.get(device_id, {})
    modbus_changed = False

    if data.name is not None:
        device.name = data.name
    if data.modbus_port is not None and data.modbus_port != device.modbus_port:
        device.modbus_port = data.modbus_port
        modbus_changed = True
    if data.modbus_slave_id is not None and data.modbus_slave_id != device.modbus_slave_id:
        device.modbus_slave_id = data.modbus_slave_id
        modbus_changed = True
    if data.config is not None:
        device.config.update(data.config)
        engine.update_device_config(device_id, data.config)
        # Check if modbus_mode changed -> need to restart server
        if "modbus_mode" in data.config or "modbus_serial_port" in data.config:
            modbus_changed = True
    if data.position_x is not None:
        meta["position_x"] = data.position_x
    if data.position_y is not None:
        meta["position_y"] = data.position_y
    _device_meta[device_id] = meta

    if modbus_changed:
        try:
            await modbus_manager.update_device(device)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not restart Modbus server for %s: %s", device_id, exc)

    return _device_to_response(device, meta)


@router.delete("/{device_id}", status_code=204)
async def delete_device(device_id: str, request: Request):
    engine = _get_engine(request)
    modbus_manager = _get_modbus_manager(request)
    device = engine.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    engine.remove_device(device_id)
    _device_meta.pop(device_id, None)

    try:
        await modbus_manager.remove_device(device_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not stop Modbus server for %s: %s", device_id, exc)


@router.post("/{device_id}/control")
async def control_device(device_id: str, command: Dict[str, Any], request: Request):
    """Send a control command directly to a device."""
    engine = _get_engine(request)
    device = engine.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    action = command.get("action")
    if action == "online":
        device.online = True
    elif action == "offline":
        device.online = False
    elif action == "set_param":
        param = command.get("param")
        value = command.get("value")
        if param and hasattr(device, param):
            setattr(device, param, value)
            # Re-wire smart meters if monitored_device_ids changed
            if device.device_type == "smart_meter":
                engine._wire_smart_meters()
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    return {"status": "ok", "device_id": device_id}
