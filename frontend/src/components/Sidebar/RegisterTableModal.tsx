/**
 * RegisterTableModal – shows the full Modbus holding-register point table
 * for a device in a scrollable modal overlay.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { getDeviceRegisters } from '../../services/api';

interface RegisterEntry {
  address: number;
  name: string;
  access: string;
  data_type: string;
  scale: number;
  unit: string;
  raw: number;
  value: string;
  description: string;
}

interface ConnectionInfo {
  mode: string;
  host?: string;
  port?: number;
  slave_id: number;
  serial_port?: string;
  baud_rate?: number;
  parity?: string;
  stopbits?: number;
  bytesize?: number;
}

interface RegisterTableData {
  device_id: string;
  device_name: string;
  device_type: string;
  function_code: string;
  register_count: number;
  connection: ConnectionInfo;
  registers: RegisterEntry[];
}

interface RegisterTableModalProps {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

export const RegisterTableModal: React.FC<RegisterTableModalProps> = ({
  deviceId,
  deviceName,
  onClose,
}) => {
  const [data, setData] = useState<RegisterTableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getDeviceRegisters(deviceId);
      setData(result as RegisterTableData);
    } catch {
      setError('加载点表失败');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const conn = data?.connection;
  // Build Modbus connection summary line
  const connLine = conn
    ? conn.mode === 'rtu'
      ? `Modbus RTU  |  串口: ${conn.serial_port}  波特率: ${conn.baud_rate}  校验: ${conn.parity}  从站ID: ${conn.slave_id}`
      : `Modbus TCP  |  地址: ${conn.host}:${conn.port}  从站ID: ${conn.slave_id}`
    : '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">📋 通讯协议点表 — {deviceName}</div>
            {data && (
              <div className="modal-subtitle">
                <span className={`protocol-type ${conn?.mode ?? 'tcp'}`}>
                  {conn?.mode?.toUpperCase() ?? 'TCP'}
                </span>
                <span className="modal-conn-line">{connLine}</span>
                <span className="modal-fc">{data.function_code}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <button className="ctrl-btn" onClick={load} title="刷新当前值">↻ 刷新</button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          {loading && <div className="modal-loading">加载中…</div>}
          {error && <div className="modal-error">{error}</div>}
          {data && !loading && (
            <table className="reg-table">
              <thead>
                <tr>
                  <th>地址</th>
                  <th>寄存器名称</th>
                  <th>读写</th>
                  <th>数据类型</th>
                  <th>比例因子</th>
                  <th>单位</th>
                  <th>原始值</th>
                  <th>实际值</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {data.registers.map((reg) => (
                  <tr key={reg.address} className={reg.access === 'R/W' ? 'rw-row' : ''}>
                    {/* Modbus PLC holding-register notation: 4xxxx prefix = FC03 Holding Registers */}
                    <td className="reg-addr">4{String(reg.address).padStart(4, '0')}</td>
                    <td className="reg-name">{reg.name}</td>
                    <td>
                      <span className={`access-badge ${reg.access === 'R/W' ? 'rw' : 'ro'}`}>
                        {reg.access}
                      </span>
                    </td>
                    <td className="reg-dtype">{reg.data_type}</td>
                    <td className="reg-scale">÷{reg.scale}</td>
                    <td className="reg-unit">{reg.unit || '—'}</td>
                    <td className="reg-raw">{reg.raw}</td>
                    <td className="reg-value">{reg.value}{reg.unit ? ` ${reg.unit}` : ''}</td>
                    <td className="reg-desc">{reg.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-footer">
          共 {data?.register_count ?? 0} 个保持寄存器（功能码 FC03 读 / FC06 单写 / FC16 批写）
        </div>
      </div>
    </div>
  );
};

export default RegisterTableModal;
