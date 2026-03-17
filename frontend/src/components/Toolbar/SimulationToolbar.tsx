import React from 'react';
import type { SimState } from '../../hooks/useSimulation';
import type { PowerBalance } from '../../types';

interface SimulationToolbarProps {
  simState: SimState;
  loading: boolean;
  connected: boolean;
  simTimeHours: number;
  powerBalance: PowerBalance | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  currentSpeed: number;
}

function formatHour(h: number): string {
  const hours = Math.floor(h) % 24;
  const minutes = Math.floor((h % 1) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export const SimulationToolbar: React.FC<SimulationToolbarProps> = ({
  simState,
  loading,
  connected,
  simTimeHours,
  powerBalance,
  onStart,
  onPause,
  onResume,
  onStop,
  onSpeedChange,
  currentSpeed,
}) => {
  return (
    <div className="simulation-toolbar">
      <div className="toolbar-left">
        <div className="toolbar-title">并网光储充系统模拟</div>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● 已连接' : '○ 未连接'}
        </div>
      </div>

      <div className="toolbar-center">
        {simState === 'stopped' && (
          <button
            className="sim-btn start-btn"
            onClick={onStart}
            disabled={loading}
          >
            ▶ 开始模拟
          </button>
        )}
        {simState === 'running' && (
          <>
            <button
              className="sim-btn pause-btn"
              onClick={onPause}
              disabled={loading}
            >
              ⏸ 暂停
            </button>
            <button
              className="sim-btn stop-btn"
              onClick={onStop}
              disabled={loading}
            >
              ⏹ 停止
            </button>
          </>
        )}
        {simState === 'paused' && (
          <>
            <button
              className="sim-btn start-btn"
              onClick={onResume}
              disabled={loading}
            >
              ▶ 继续
            </button>
            <button
              className="sim-btn stop-btn"
              onClick={onStop}
              disabled={loading}
            >
              ⏹ 停止
            </button>
          </>
        )}

        <div className="speed-control">
          <label>速度: </label>
          <select
            value={currentSpeed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
          >
            <option value={1}>1×</option>
            <option value={60}>60× (1分/秒)</option>
            <option value={300}>300× (5分/秒)</option>
            <option value={600}>600× (10分/秒)</option>
            <option value={3600}>3600× (1时/秒)</option>
          </select>
        </div>

        {simState !== 'stopped' && (
          <div className="sim-time">
            🕐 {formatHour(simTimeHours)}
          </div>
        )}
      </div>

      <div className="toolbar-right">
        {powerBalance && (
          <div className="power-summary">
            <span className="ps-item pv">
              ☀️ {powerBalance.pv_total_kw.toFixed(1)} kW
            </span>
            <span className="ps-item bess">
              🔋 {powerBalance.bess_net_kw.toFixed(1)} kW
            </span>
            <span className="ps-item load">
              💡 {powerBalance.load_total_kw.toFixed(1)} kW
            </span>
            <span className="ps-item ev">
              🔌 {powerBalance.ev_total_kw.toFixed(1)} kW
            </span>
            <span
              className={`ps-item grid ${powerBalance.grid_power_kw > 0 ? 'import' : 'export'}`}
            >
              ⚡ {powerBalance.grid_power_kw.toFixed(1)} kW
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulationToolbar;
