"""Global configuration for the microgrid simulation system."""

# Simulation settings
SIMULATION_STEP_SECONDS = 1.0        # Default real-time step between updates (seconds)
SIMULATION_MIN_STEP_SECONDS = 0.1    # Minimum allowed step (100 ms)
SIMULATION_MAX_STEP_SECONDS = 10.0   # Maximum allowed step
SIMULATION_SPEED_MULTIPLIER = 60.0  # How many sim-seconds per real second
SIMULATION_START_HOUR = 0.0         # Start at midnight

# Modbus settings
MODBUS_BASE_PORT = 5020             # First device starts at this port
MODBUS_DEFAULT_SLAVE_ID = 1

# API settings
API_HOST = "0.0.0.0"
API_PORT = 8000

# Topology file
TOPOLOGY_FILE = "topology.json"

# Power balance tolerance (kW)
POWER_BALANCE_TOLERANCE = 0.001
