"""Topology management API."""

import json
import logging
from pathlib import Path
from typing import Dict, Any

from fastapi import APIRouter, Request, HTTPException

from backend.config import TOPOLOGY_FILE
from backend.models.topology import TopologySave

router = APIRouter(prefix="/api/topology", tags=["topology"])
logger = logging.getLogger(__name__)

_TOPO_PATH = Path(TOPOLOGY_FILE)


@router.get("/")
async def get_topology(request: Request):
    """Return the current topology (node positions + edges from frontend)."""
    if _TOPO_PATH.exists():
        try:
            with _TOPO_PATH.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not read topology file: %s", exc)
    return {"nodes": [], "edges": []}


@router.post("/")
async def save_topology(data: TopologySave):
    """Persist the React Flow canvas topology to disk."""
    payload = {
        "nodes": data.nodes,
        "edges": [e.model_dump() for e in data.edges],
    }
    try:
        with _TOPO_PATH.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "saved"}
