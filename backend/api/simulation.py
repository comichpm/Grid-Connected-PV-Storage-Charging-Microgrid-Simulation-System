"""Simulation control API (start / pause / resume / stop / status)."""

import logging
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/simulation", tags=["simulation"])
logger = logging.getLogger(__name__)


class SpeedRequest(BaseModel):
    multiplier: float


class StepRequest(BaseModel):
    seconds: float  # real-time update interval (0.1 – 10.0 s)


@router.get("/status")
async def get_status(request: Request):
    engine = request.app.state.engine
    return engine.get_status()


@router.post("/start")
async def start_simulation(request: Request):
    engine = request.app.state.engine
    await engine.start()
    return {"state": engine.state}


@router.post("/pause")
async def pause_simulation(request: Request):
    engine = request.app.state.engine
    await engine.pause()
    return {"state": engine.state}


@router.post("/resume")
async def resume_simulation(request: Request):
    engine = request.app.state.engine
    await engine.resume()
    return {"state": engine.state}


@router.post("/stop")
async def stop_simulation(request: Request):
    engine = request.app.state.engine
    await engine.stop()
    return {"state": engine.state}


@router.post("/speed")
async def set_speed(data: SpeedRequest, request: Request):
    engine = request.app.state.engine
    engine.set_speed(data.multiplier)
    return {"speed_multiplier": engine.speed_multiplier}


@router.post("/step")
async def set_step(data: StepRequest, request: Request):
    """Set real-time update interval (Req 9 – minimum 100 ms)."""
    engine = request.app.state.engine
    engine.set_step(data.seconds)
    return {"step_seconds": engine.step_seconds}
