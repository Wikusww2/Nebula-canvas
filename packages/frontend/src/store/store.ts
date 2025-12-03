import { create } from 'zustand';
import {
    Connection,
    Edge,
    EdgeChange,
    Node,
    NodeChange,
    addEdge,
    OnNodesChange,
    OnEdgesChange,
    OnConnect,
    applyNodeChanges,
    applyEdgeChanges,
} from 'reactflow';
import { Block, Connection as DBConnection } from '@nebula/shared';

interface CanvasState {
    nodes: Node[];
    edges: Edge[];
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    addBlock: (type: 'TEXT' | 'IMAGE', position: { x: number; y: number }) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
    nodes: [],
    edges: [],
    onNodesChange: (changes: NodeChange[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },
    onEdgesChange: (changes: EdgeChange[]) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },
    onConnect: (connection: Connection) => {
        set({
            edges: addEdge(connection, get().edges),
        });
        // TODO: Sync with backend
    },
    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),
    addBlock: (type, position) => {
        const newNode: Node = {
            id: `node-${Date.now()}`,
            type: type === 'TEXT' ? 'textBlock' : 'imageBlock',
            position,
            data: { label: `New ${type} Block` },
        };
        set({ nodes: [...get().nodes, newNode] });
        // TODO: Sync with backend
    },
}));
