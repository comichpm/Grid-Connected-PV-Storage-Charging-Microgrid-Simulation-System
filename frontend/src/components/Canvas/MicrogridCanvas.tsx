import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GridNode } from './GridNode';
import { PVNode } from './PVNode';
import { BESSNode } from './BESSNode';
import { EVChargerNode } from './EVChargerNode';
import { LoadNode } from './LoadNode';
import { SmartMeterNode } from './SmartMeterNode';
import { PowerFlowEdge } from './PowerFlowEdge';
import type { DeviceState, DeviceType, DeviceInfo } from '../../types';
import { createDevice, deleteDevice, saveTopology, getTopology } from '../../services/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: NodeTypes = {
  grid: GridNode as NodeTypes[string],
  pv: PVNode as NodeTypes[string],
  bess: BESSNode as NodeTypes[string],
  ev_charger: EVChargerNode as NodeTypes[string],
  load: LoadNode as NodeTypes[string],
  smart_meter: SmartMeterNode as NodeTypes[string],
};

const edgeTypes: EdgeTypes = {
  powerFlow: PowerFlowEdge as EdgeTypes[string],
};

interface MicrogridCanvasProps {
  deviceStates: Record<string, DeviceState>;
  deviceList?: DeviceInfo[];
  onNodeClick: (deviceId: string) => void;
  onDevicesChange: () => void;
}

export const MicrogridCanvas: React.FC<MicrogridCanvasProps> = ({
  deviceStates,
  deviceList = [],
  onNodeClick,
  onDevicesChange,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const topologyLoaded = useRef(false);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, type: 'powerFlow' }, eds)),
    [setEdges]
  );

  // Auto-load topology and device nodes from the backend on first mount,
  // so the canvas restores its previous state across page refreshes.
  React.useEffect(() => {
    if (topologyLoaded.current || !deviceList.length) return;
    topologyLoaded.current = true;

    getTopology()
      .then((topo) => {
        const deviceMap = new Map<string, DeviceInfo>(
          deviceList.map((d) => [d.id, d])
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const savedNodes: Node[] = (topo.nodes ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((n: any) => {
            const deviceId: string = n.data?.deviceId ?? n.id;
            const device = deviceMap.get(deviceId);
            if (!device) return null;
            const state = deviceStates[device.id];
            return {
              id: device.id,
              type: device.device_type,
              position: n.position ?? { x: device.position_x, y: device.position_y },
              data: {
                deviceId: device.id,
                deviceType: device.device_type,
                label: device.name,
                state: state ?? device.state,
                modbusPort: device.modbus_port,
                modbusSlave: device.modbus_slave_id,
                modbusMode: (device.config?.modbus_mode as string) ?? 'tcp',
                modbusSerial: (device.config?.modbus_serial_port as string) ?? '',
                modbusBaud: (device.config?.modbus_baud_rate as number) ?? 9600,
                modbusParity: (device.config?.modbus_parity as string) ?? 'N',
                onClick: () => onNodeClick(device.id),
              },
            } as Node;
          })
          .filter(Boolean) as Node[];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const savedEdges: Edge[] = (topo.edges ?? []).map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'powerFlow',
          data: {
            source_power_kw: deviceStates[e.source]?.power_kw ?? 0,
            source_type: deviceStates[e.source]?.device_type ?? '',
          },
        }));

        if (savedNodes.length > 0) setNodes(savedNodes);
        if (savedEdges.length > 0) setEdges(savedEdges);
      })
      .catch(console.error);
  }, [deviceList, deviceStates, onNodeClick, setNodes, setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);


  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      const deviceType = event.dataTransfer.getData('application/deviceType') as DeviceType;
      const deviceName = event.dataTransfer.getData('application/deviceName');
      if (!deviceType) return;

      const rect = reactFlowWrapper.current?.getBoundingClientRect();
      const x = event.clientX - (rect?.left ?? 0);
      const y = event.clientY - (rect?.top ?? 0);

      const defaultPorts: Record<DeviceType, number> = {
        grid: 5020,
        pv: 5021,
        bess: 5022,
        ev_charger: 5023,
        load: 5024,
        smart_meter: 5025,
      };

      try {
        const device = await createDevice({
          name: deviceName || deviceType,
          device_type: deviceType,
          modbus_port: defaultPorts[deviceType] + Math.floor(Math.random() * 100),
          modbus_slave_id: 1,
          config: {},
          position_x: x,
          position_y: y,
        });

        const newNode: Node = {
          id: device.id,
          type: deviceType,
          position: { x, y },
          data: {
            deviceId: device.id,
            deviceType,
            label: device.name,
            state: device.state,
            modbusPort: device.modbus_port,
            modbusSlave: device.modbus_slave_id,
            modbusMode: (device.config?.modbus_mode as string) ?? 'tcp',
            modbusSerial: (device.config?.modbus_serial_port as string) ?? '',
            modbusBaud: (device.config?.modbus_baud_rate as number) ?? 9600,
            modbusParity: (device.config?.modbus_parity as string) ?? 'N',
            onClick: () => onNodeClick(device.id),
          },
        };

        setNodes((nds) => [...nds, newNode]);
        onDevicesChange();
      } catch (err) {
        console.error('Failed to create device:', err);
      }
    },
    [setNodes, onNodeClick, onDevicesChange]
  );

  // Update node data when simulation updates arrive
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const state = deviceStates[node.id];
        if (state) {
          return {
            ...node,
            data: {
              ...node.data,
              state,
              label: state.name,
            },
          };
        }
        return node;
      })
    );
  }, [deviceStates, setNodes]);

  // Update edge power flow data when device states change
  React.useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const srcState = deviceStates[edge.source];
        return {
          ...edge,
          type: 'powerFlow',
          data: {
            ...edge.data,
            source_power_kw: srcState?.power_kw ?? 0,
            source_type: srcState?.device_type ?? '',
          },
        };
      })
    );
  }, [deviceStates, setEdges]);

  // Sync Modbus / protocol info when deviceList changes (e.g. after config save)
  React.useEffect(() => {
    if (!deviceList.length) return;
    const infoMap = new Map<string, DeviceInfo>(deviceList.map((d: DeviceInfo) => [d.id, d]));
    setNodes((nds: Node[]) =>
      nds.map((node: Node) => {
        const info = infoMap.get(node.id);
        if (!info) return node;
        return {
          ...node,
          data: {
            ...node.data,
            modbusPort: info.modbus_port,
            modbusSlave: info.modbus_slave_id,
            modbusMode: (info.config?.modbus_mode as string) ?? 'tcp',
            modbusSerial: (info.config?.modbus_serial_port as string) ?? '',
            modbusBaud: (info.config?.modbus_baud_rate as number) ?? 9600,
            modbusParity: (info.config?.modbus_parity as string) ?? 'N',
          },
        };
      })
    );
  }, [deviceList, setNodes]);

  const onNodesDelete = useCallback(
    async (deleted: Node[]) => {
      for (const node of deleted) {
        try {
          await deleteDevice(node.id);
          onDevicesChange();
        } catch (err) {
          console.error('Failed to delete device:', err);
        }
      }
    },
    [onDevicesChange]
  );

  // Auto-save topology when nodes/edges change
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTopology({
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: { deviceId: (n.data as { deviceId: string }).deviceId },
        })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      }).catch(console.error);
    }, 1000);
  }, [nodes, edges]);

  return (
    <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodesDelete={onNodesDelete}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'powerFlow' }}
        connectionMode={ConnectionMode.Loose}
        fitView
        deleteKeyCode="Delete"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

export default MicrogridCanvas;
