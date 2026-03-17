import axios from 'axios';
import type { DeviceInfo, DeviceConfig, DeviceType } from '../types';

const BASE_URL = '/api';

const api = axios.create({ baseURL: BASE_URL });

export interface CreateDeviceRequest {
  name: string;
  device_type: DeviceType;
  modbus_port: number;
  modbus_slave_id: number;
  config: DeviceConfig;
  position_x: number;
  position_y: number;
}

export interface UpdateDeviceRequest {
  name?: string;
  modbus_port?: number;
  modbus_slave_id?: number;
  config?: DeviceConfig;
  position_x?: number;
  position_y?: number;
}

// Devices
export const getDevices = (): Promise<DeviceInfo[]> =>
  api.get('/devices/').then((r) => r.data);

export const createDevice = (data: CreateDeviceRequest): Promise<DeviceInfo> =>
  api.post('/devices/', data).then((r) => r.data);

export const updateDevice = (
  id: string,
  data: UpdateDeviceRequest
): Promise<DeviceInfo> => api.put(`/devices/${id}`, data).then((r) => r.data);

export const deleteDevice = (id: string): Promise<void> =>
  api.delete(`/devices/${id}`).then(() => undefined);

export const controlDevice = (
  id: string,
  command: Record<string, unknown>
): Promise<unknown> =>
  api.post(`/devices/${id}/control`, command).then((r) => r.data);

// Simulation
export const getSimulationStatus = () =>
  api.get('/simulation/status').then((r) => r.data);

export const startSimulation = () =>
  api.post('/simulation/start').then((r) => r.data);

export const pauseSimulation = () =>
  api.post('/simulation/pause').then((r) => r.data);

export const resumeSimulation = () =>
  api.post('/simulation/resume').then((r) => r.data);

export const stopSimulation = () =>
  api.post('/simulation/stop').then((r) => r.data);

export const setSimulationSpeed = (multiplier: number) =>
  api.post('/simulation/speed', { multiplier }).then((r) => r.data);

export const setSimulationStep = (seconds: number) =>
  api.post('/simulation/step', { seconds }).then((r) => r.data);

// Topology
export const getTopology = () =>
  api.get('/topology/').then((r) => r.data);

export const saveTopology = (data: {
  nodes: unknown[];
  edges: unknown[];
}) => api.post('/topology/', data).then((r) => r.data);

// Register point table
export const getDeviceRegisters = (id: string): Promise<unknown> =>
  api.get(`/devices/${id}/registers`).then((r) => r.data);
