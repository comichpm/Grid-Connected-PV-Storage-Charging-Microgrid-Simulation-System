"""FastAPI main entry point for the Microgrid Simulation System."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import API_HOST, API_PORT
from backend.engine.simulation_engine import SimulationEngine
from backend.protocol.modbus_server import ModbusServerManager
from backend.api import devices as devices_api
from backend.api import topology as topology_api
from backend.api import simulation as simulation_api
from backend.api import websocket as websocket_api

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Microgrid Simulation System backend...")
    app.state.engine = SimulationEngine()
    app.state.modbus_manager = ModbusServerManager(host="0.0.0.0")
    yield
    # Shutdown
    engine: SimulationEngine = app.state.engine
    modbus_manager: ModbusServerManager = app.state.modbus_manager
    await engine.stop()
    await modbus_manager.stop_all()
    logger.info("Backend shut down cleanly.")


app = FastAPI(
    title="Grid-Connected PV-Storage-Charging Microgrid Simulation System",
    description="并网光储充系统模拟系统后端 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS – allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(devices_api.router)
app.include_router(topology_api.router)
app.include_router(simulation_api.router)
app.include_router(websocket_api.router)


@app.get("/")
async def root():
    return {
        "message": "Microgrid Simulation System API",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=API_HOST,
        port=API_PORT,
        reload=False,
        log_level="info",
    )
