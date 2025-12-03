import React, { useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TextBlock, ImageBlock } from './nodes/CustomNodes';
import { useCanvasStore } from '../store/store';

const THEME = {
    colors: {
        grid: '#20232a',
        bg: '#050607',
    }
};

export default function Canvas() {
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useCanvasStore();

    const nodeTypes = useMemo<NodeTypes>(() => ({
        textBlock: TextBlock,
        imageBlock: ImageBlock,
    }), []);

    return (
        <div className="w-full h-screen bg-[#050607]">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                className="bg-[#050607]"
            >
                <Background color={THEME.colors.grid} gap={16} size={1} />
                <Controls className="bg-[#111318] border border-white/10 text-white fill-white" />
            </ReactFlow>
        </div>
    );
}
