import React, { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSimulation } from './hooks/useSimulation';
import { MicrogridCanvas } from './components/Canvas/MicrogridCanvas';
import { DevicePalette } from './components/Sidebar/DevicePalette';
import { DeviceConfigPanel } from './components/Sidebar/DeviceConfigPanel';
import { SimulationToolbar } from './components/Toolbar/SimulationToolbar';
import type { DeviceState, PowerBalance, DeviceInfo } from './types';
import { getDevices, getSimulationStatus, setSimulationStep } from './services/api';

const App: React.FC = () => {
  const { lastUpdate, connected } = useWebSocket();
  const { simState, setSimState, loading, start, pause, resume, stop, setSpeed } =
    useSimulation('stopped');
  const [speed, setSpeedLocal] = useState(60);
  const [stepSeconds, setStepLocal] = useState(1.0);
  const [deviceStates, setDeviceStates] = useState<Record<string, DeviceState>>({});
  const [powerBalance, setPowerBalance] = useState<PowerBalance | null>(null);
  const [simTimeHours, setSimTimeHours] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const [deviceList, setDeviceList] = useState<DeviceInfo[]>([]);

  // Sync simulation updates
  useEffect(() => {
    if (!lastUpdate) return;
    setSimState(lastUpdate.sim_state);
    setSimTimeHours(lastUpdate.sim_time_hours);
    setPowerBalance(lastUpdate.power_balance);
    const stateMap: Record<string, DeviceState> = {};
    (lastUpdate.devices ?? []).forEach((d) => {
      stateMap[d.id] = d;
    });
    setDeviceStates(stateMap);
  }, [lastUpdate, setSimState]);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await getDevices();
      setDeviceList(devices);
      if (selectedDeviceId) {
        const found = devices.find((d) => d.id === selectedDeviceId);
        setSelectedDevice(found ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  }, [selectedDeviceId]);

  // Initial load
  useEffect(() => {
    getSimulationStatus()
      .then((status) => {
        setSimState(status.state);
        setSimTimeHours(status.sim_time_hours ?? 0);
        if (status.power_balance) setPowerBalance(status.power_balance);
      })
      .catch(console.error);
    refreshDevices();
  }, [refreshDevices, setSimState]);

  const handleNodeClick = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      const found = deviceList.find((d) => d.id === deviceId);
      if (found) {
        // Merge with latest state
        const latestState = deviceStates[deviceId];
        setSelectedDevice(latestState ? { ...found, state: latestState } : found);
      }
    },
    [deviceList, deviceStates]
  );

  // Update selected device when state changes
  useEffect(() => {
    if (selectedDeviceId && deviceStates[selectedDeviceId]) {
      setSelectedDevice((prev) =>
        prev ? { ...prev, state: deviceStates[selectedDeviceId] } : null
      );
    }
  }, [deviceStates, selectedDeviceId]);

  const handleSpeedChange = useCallback(
    async (s: number) => {
      setSpeedLocal(s);
      await setSpeed(s);
    },
    [setSpeed]
  );

  const handleStepChange = useCallback(async (s: number) => {
    setStepLocal(s);
    await setSimulationStep(s);
  }, []);

  return (
    <div className="app-container">
      <SimulationToolbar
        simState={simState}
        loading={loading}
        connected={connected}
        simTimeHours={simTimeHours}
        powerBalance={powerBalance}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onStop={stop}
        onSpeedChange={handleSpeedChange}
        onStepChange={handleStepChange}
        currentSpeed={speed}
        currentStep={stepSeconds}
      />
      <div className="app-body">
        <div className="sidebar-left">
          <DevicePalette />
        </div>
        <div className="canvas-area">
          <MicrogridCanvas
            deviceStates={deviceStates}
            deviceList={deviceList}
            onNodeClick={handleNodeClick}
            onDevicesChange={refreshDevices}
          />
        </div>
        {selectedDevice && (
          <div className="sidebar-right">
            <DeviceConfigPanel
              device={selectedDevice}
              onClose={() => {
                setSelectedDeviceId(null);
                setSelectedDevice(null);
              }}
              onUpdate={refreshDevices}
              deviceList={deviceList}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
