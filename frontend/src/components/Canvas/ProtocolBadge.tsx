/**
 * ProtocolBadge – small info line shown at the bottom of every device node
 * that describes the outward Modbus communication endpoint (Req: 查看通讯协议).
 *
 * Examples:
 *   Modbus TCP  :5020 / 从站 1
 *   Modbus RTU  /dev/ttyUSB0  9600 N
 */
import React from 'react';

export interface ProtocolInfo {
  modbusPort?: number;       // TCP port
  modbusSlave?: number;      // Slave / unit ID
  modbusMode?: string;       // 'tcp' | 'rtu'
  modbusSerial?: string;     // RTU serial port path
  modbusBaud?: number;       // RTU baud rate
  modbusParity?: string;     // RTU parity
}

export const ProtocolBadge: React.FC<ProtocolInfo> = ({
  modbusPort,
  modbusSlave,
  modbusMode = 'tcp',
  modbusSerial,
  modbusBaud,
  modbusParity = 'N',
}) => {
  const isRTU = modbusMode === 'rtu';

  if (isRTU) {
    const serial = modbusSerial ?? '/dev/ttyUSB0';
    const baud = modbusBaud ?? 9600;
    return (
      <div className="protocol-badge" title="Modbus RTU 通讯协议">
        <span className="protocol-type rtu">RTU</span>
        <span className="protocol-detail">{serial} @{baud}{modbusParity !== 'N' ? ` ${modbusParity}` : ''}</span>
        {modbusSlave !== undefined && (
          <span className="protocol-slave"> /从站{modbusSlave}</span>
        )}
      </div>
    );
  }

  return (
    <div className="protocol-badge" title="Modbus TCP 通讯协议">
      <span className="protocol-type tcp">TCP</span>
      <span className="protocol-detail">:{modbusPort ?? '?'}</span>
      {modbusSlave !== undefined && (
        <span className="protocol-slave"> /从站{modbusSlave}</span>
      )}
    </div>
  );
};

export default ProtocolBadge;
