"""WebSocket endpoint for real-time simulation data push."""

import asyncio
import json
import logging
from typing import Set, Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request

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
async def websocket_endpoint(websocket: WebSocket, request: Request):
    await websocket.accept()
    _connections.add(websocket)
    engine = request.app.state.engine
    engine.register_ws_callback(broadcast)
    logger.info("WebSocket client connected. Total: %d", len(_connections))
    try:
        # Send current status immediately
        status = engine.get_status()
        status["type"] = "simulation_update"
        await websocket.send_text(json.dumps(status, ensure_ascii=False, default=str))

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
