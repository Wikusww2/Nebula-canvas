import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play, Maximize, ImageIcon, Type } from 'lucide-react';

const NodeContainer = ({ children, selected, title, type, onRun }: any) => (
    <div className={`
    relative flex flex-col overflow-hidden bg-[#111318] rounded-[24px]
    border border-white/5 shadow-[0_18px_40px_rgba(0,0,0,0.55)]
    transition-colors duration-200 min-w-[280px]
    ${selected ? 'border-white/10 ring-1 ring-[#3fa6ff]/50' : 'hover:border-white/10'}
  `}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 select-none">
            <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-[#f8f8fb] tracking-wide">
                    {title}
                </span>
            </div>
            <span className="text-[10px] uppercase font-medium tracking-wider text-[#7b7f8d] px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
                {type}
            </span>
        </div>

        {children}

        {/* Footer / Run */}
        <div className="p-3 pt-0 flex justify-end">
            <button
                onClick={(e) => { e.stopPropagation(); onRun?.(); }}
                className="w-8 h-8 rounded-full bg-[#f5f5f7] hover:bg-white text-black hover:scale-105 flex items-center justify-center shadow-lg transition-all"
            >
                <Play size={14} fill="currentColor" className="ml-0.5" />
            </button>
        </div>

        {/* Ports */}
        <Handle type="target" position={Position.Left} className="!bg-[#111318] !border-2 !border-[#7b7f8d] !w-3 !h-3 hover:!border-[#3fa6ff]" />
        <Handle type="source" position={Position.Right} className="!bg-[#111318] !border-2 !border-[#f5f5f7] !w-3 !h-3 hover:!border-[#3fa6ff]" />
    </div>
);

export const TextBlock = memo(({ data, selected }: NodeProps) => {
    return (
        <NodeContainer selected={selected} title={data.label || 'Text Block'} type="GPT-4o" onRun={data.onRun}>
            <div className="p-3">
                <div className="bg-white/[0.02] rounded-[16px] p-4 min-h-[120px] border border-white/5 hover:bg-white/[0.04] transition-colors group/text">
                    <textarea
                        className="w-full h-full bg-transparent border-none resize-none text-[13px] font-mono text-[#b2b5c3] leading-relaxed focus:outline-none nodrag"
                        defaultValue={data.text || ''}
                        placeholder="Enter prompt..."
                    />
                </div>
            </div>
        </NodeContainer>
    );
});

export const ImageBlock = memo(({ data, selected }: NodeProps) => {
    return (
        <NodeContainer selected={selected} title={data.label || 'Image Block'} type="FLUX" onRun={data.onRun}>
            <div className="p-3">
                <div className="group/img relative aspect-[4/5] w-full rounded-[20px] overflow-hidden bg-[#050607] border border-white/5">
                    {data.url ? (
                        <img
                            src={data.url}
                            alt="Generated"
                            className="w-full h-full object-cover"
                            draggable={false}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#2d3039]">
                            <ImageIcon size={48} />
                        </div>
                    )}
                </div>
                <p className="mt-3 text-[12px] text-[#7b7f8d] line-clamp-2 leading-tight">
                    {data.caption || 'Ready to generate...'}
                </p>
            </div>
        </NodeContainer>
    );
});
