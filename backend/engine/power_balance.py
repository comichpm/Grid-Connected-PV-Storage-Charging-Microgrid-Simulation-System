"""Power balance algorithm for the microgrid simulation."""

from typing import List, Dict, Any, Tuple
from backend.devices.base_device import BaseDevice
from backend.devices.grid import GridDevice


def calculate_power_balance(devices: List[BaseDevice]) -> Tuple[float, Dict[str, float]]:
    """Calculate system power balance and set the grid device power.

    Power sign convention:
      +kW  → device consuming from bus (loads, EV chargers, BESS charging)
      -kW  → device injecting to bus (PV, BESS discharging)

    The grid power is set so that the algebraic sum of ALL device powers = 0.
    i.e., grid_power = -Σ(non_grid_powers)

    Returns:
        (grid_power_kw, summary_dict)
    """
    pv_total = 0.0
    bess_net = 0.0
    load_total = 0.0
    ev_total = 0.0
    other_total = 0.0
    grid_device: GridDevice = None  # type: ignore[assignment]

    for device in devices:
        if device.device_type == "grid":
            grid_device = device  # type: ignore[assignment]
        elif device.device_type == "pv":
            pv_total += device.power_kw  # negative (generation)
        elif device.device_type == "bess":
            bess_net += device.power_kw  # signed
        elif device.device_type == "ev_charger":
            ev_total += device.power_kw  # positive (consumption)
        elif device.device_type == "load":
            load_total += device.power_kw  # positive (consumption)
        else:
            other_total += device.power_kw

    non_grid_sum = pv_total + bess_net + load_total + ev_total + other_total
    grid_power = -non_grid_sum  # Grid balances the system

    if grid_device is not None and grid_device.online:
        # Apply grid import/export limits
        if grid_power > 0:
            grid_power = min(grid_power, grid_device.max_import_kw)
        else:
            grid_power = max(grid_power, -grid_device.max_export_kw)
        grid_device.power_kw = grid_power
    elif grid_device is not None:
        grid_device.power_kw = 0.0
        grid_power = 0.0

    balance_error = non_grid_sum + grid_power  # should be 0

    summary = {
        "pv_total_kw": round(-pv_total, 3),         # reported as positive generation
        "bess_net_kw": round(bess_net, 3),           # + = charging, - = discharging
        "load_total_kw": round(load_total, 3),
        "ev_total_kw": round(ev_total, 3),
        "grid_power_kw": round(grid_power, 3),
        "balance_error_kw": round(balance_error, 6),
    }

    return grid_power, summary
