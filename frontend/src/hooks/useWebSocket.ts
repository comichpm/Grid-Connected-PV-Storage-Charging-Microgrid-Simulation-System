import { useEffect, useRef, useState, useCallback } from 'react';
import type { SimulationUpdate } from '../types';

const WS_URL = `ws://${window.location.host}/ws`;

export function useWebSocket() {
  const [lastUpdate, setLastUpdate] = useState<SimulationUpdate | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SimulationUpdate;
        setLastUpdate(data);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2 seconds
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 10000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { lastUpdate, connected };
}
