"""FastAPI main entry point for the Microgrid Simulation System."""

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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

# Path to the built frontend dist folder (created by `npm run build`)
_REPO_ROOT = Path(__file__).parent.parent
_FRONTEND_DIST = _REPO_ROOT / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Microgrid Simulation System backend...")
    if _FRONTEND_DIST.exists():
        logger.info("Frontend dist found at %s – serving as static files", _FRONTEND_DIST)
    else:
        logger.info(
            "Frontend dist NOT found. Run 'cd frontend && npm run build' to enable "
            "single-port deployment."
        )
    app.state.engine = SimulationEngine()
    app.state.modbus_manager = ModbusServerManager(host="0.0.0.0")
    # Restore topology edges from last saved session so multi-bus
    # power balance works immediately without a canvas interaction.
    app.state.engine.load_topology_from_file()
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

# CORS – allow frontend dev server and other origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers (must be before the static-file catch-all)
app.include_router(devices_api.router)
app.include_router(topology_api.router)
app.include_router(simulation_api.router)
app.include_router(websocket_api.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Static-file serving (single-port production mode) ──────────────────────
# This block runs AFTER the API routes so the SPA catch-all never shadows them.
if _FRONTEND_DIST.exists():
    # Serve JS/CSS/image assets
    app.mount(
        "/assets",
        StaticFiles(directory=str(_FRONTEND_DIST / "assets")),
        name="assets",
    )

    @app.get("/")
    async def serve_root():
        return FileResponse(str(_FRONTEND_DIST / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA fallback – return index.html for any non-API path."""
        # Exclude WebSocket paths from the SPA catch-all
        if full_path in ("ws", "ws/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        file_path = _FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
else:
    @app.get("/")
    async def root():
        return {
            "message": "Microgrid Simulation System API",
            "docs": "/docs",
            "note": "Run 'cd frontend && npm run build' then restart to serve the UI here.",
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=API_HOST,
        port=API_PORT,
        reload=False,
        log_level="info",
    )
