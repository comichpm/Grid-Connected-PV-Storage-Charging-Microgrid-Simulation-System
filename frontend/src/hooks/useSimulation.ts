import { useState, useCallback } from 'react';
import {
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  stopSimulation,
  setSimulationSpeed,
} from '../services/api';

export type SimState = 'stopped' | 'running' | 'paused';

export function useSimulation(initialState: SimState = 'stopped') {
  const [simState, setSimState] = useState<SimState>(initialState);
  const [loading, setLoading] = useState(false);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const result = await startSimulation();
      setSimState(result.state);
    } finally {
      setLoading(false);
    }
  }, []);

  const pause = useCallback(async () => {
    setLoading(true);
    try {
      const result = await pauseSimulation();
      setSimState(result.state);
    } finally {
      setLoading(false);
    }
  }, []);

  const resume = useCallback(async () => {
    setLoading(true);
    try {
      const result = await resumeSimulation();
      setSimState(result.state);
    } finally {
      setLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setLoading(true);
    try {
      const result = await stopSimulation();
      setSimState(result.state);
    } finally {
      setLoading(false);
    }
  }, []);

  const setSpeed = useCallback(async (multiplier: number) => {
    await setSimulationSpeed(multiplier);
  }, []);

  return { simState, setSimState, loading, start, pause, resume, stop, setSpeed };
}
