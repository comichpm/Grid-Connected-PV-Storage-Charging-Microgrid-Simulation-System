"""WebSocket endpoint for real-time simulation data push."""

import asyncio
import json
import logging
from typing import Set, Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)

# Active WebSocket connections
_connections: Set[WebSocket] = set()


async def broadcast(payload: Dict[str, Any]) -> None:
    """Broadcast a payload to all connected WebSocket clients."""
    if not _connections:
        return
    message = json.dumps(payload, ensure_ascii=False, default=str)
    dead: Set[WebSocket] = set()
    for ws in list(_connections):
        try:
            await ws.send_text(message)
        except Exception:  # noqa: BLE001
            dead.add(ws)
    _connections.difference_update(dead)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _connections.add(websocket)
    engine = websocket.app.state.engine
    engine.register_ws_callback(broadcast)
    logger.info("WebSocket client connected. Total: %d", len(_connections))
    try:
        # Send current status immediately using the same format as broadcast messages
        device_list = list(engine.devices.values())
        from backend.engine.power_balance import calculate_power_balance
        import time
        _, power_summary = calculate_power_balance(device_list)
        initial_payload = {
            "type": "simulation_update",
            "timestamp": time.time(),
            "sim_time_hours": round(engine.sim_time_hours, 4),
            "sim_state": engine.state,
            "power_balance": power_summary,
            "devices": [d.get_state_dict() for d in device_list],
        }
        await websocket.send_text(json.dumps(initial_payload, ensure_ascii=False, default=str))

        while True:
            # Keep alive – wait for client messages (ping/pong or control)
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:  # noqa: BLE001
                pass
    except WebSocketDisconnect:
        pass
    finally:
        _connections.discard(websocket)
        if not _connections:
            engine.unregister_ws_callback(broadcast)
        logger.info("WebSocket client disconnected. Total: %d", len(_connections))
