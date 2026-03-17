import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GridNode } from './GridNode';
import { PVNode } from './PVNode';
import { BESSNode } from './BESSNode';
import { EVChargerNode } from './EVChargerNode';
import { LoadNode } from './LoadNode';
import type { DeviceState, DeviceType } from '../../types';
import { createDevice, deleteDevice, saveTopology } from '../../services/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: NodeTypes = {
  grid: GridNode as NodeTypes[string],
  pv: PVNode as NodeTypes[string],
  bess: BESSNode as NodeTypes[string],
  ev_charger: EVChargerNode as NodeTypes[string],
  load: LoadNode as NodeTypes[string],
};

interface MicrogridCanvasProps {
  deviceStates: Record<string, DeviceState>;
  onNodeClick: (deviceId: string) => void;
  onDevicesChange: () => void;
}

export const MicrogridCanvas: React.FC<MicrogridCanvasProps> = ({
  deviceStates,
  onNodeClick,
  onDevicesChange,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

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
