import React, { useState } from 'react';
import { Play, MoreHorizontal, Maximize, Trash2, AlertCircle, ChevronDown } from 'lucide-react';
import { Block } from '../types';
import { THEME, AVAILABLE_MODELS } from '../constants';

interface BlockNodeProps {
  block: Block;
  isSelected: boolean;
  zoom: number;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateContent: (id: string, content: Partial<Block['content']>) => void;
  onUpdateModel: (id: string, modelId: string) => void;
}

export const BlockNode: React.FC<BlockNodeProps> = ({
  block,
  isSelected,
  zoom,
  onMouseDown,
  onRun,
  onDelete,
  onUpdateContent,
  onUpdateModel
}) => {
  const [showModelMenu, setShowModelMenu] = useState(false);
  const isImage = block.type === 'IMAGE';
  const models = AVAILABLE_MODELS.filter(m => m.type === block.type);

  const handleRunClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRun(block.id);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, field: 'text' | 'promptTemplate' | 'imagePrompt') => {
    onUpdateContent(block.id, { [field]: e.target.value });
  };

  const toggleModelMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowModelMenu(!showModelMenu);
  };

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, block.id)}
      className="absolute flex flex-col group"
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        transform: 'translate3d(0,0,0)',
        zIndex: isSelected ? 50 : 10,
      }}
    >
      {/* Selection Glow */}
      <div 
        className={`absolute -inset-[2px] rounded-[26px] pointer-events-none transition-all duration-300 ${
          isSelected 
            ? 'opacity-100' 
            : 'opacity-0'
        }`}
        style={{
           boxShadow: isSelected ? THEME.colors.glow : 'none',
           border: isSelected ? `2px solid ${THEME.colors.borderSelected}` : 'none'
        }}
      />

      {/* Main Card */}
      <div 
        className={`
          relative flex flex-col overflow-hidden bg-[#111318] rounded-[24px]
          border shadow-[0_18px_40px_rgba(0,0,0,0.55)]
          transition-colors duration-200
        `}
        style={{
            borderColor: isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 select-none cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-[#f8f8fb] tracking-wide truncate max-w-[140px]">
              {block.title}
            </span>
            {block.isStale && (
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" title="Stale inputs" />
            )}
            {block.status === 'error' && (
              <div title={block.errorMessage} className="text-red-500">
                <AlertCircle size={14} />
              </div>
            )}
          </div>
          
          {/* Model Selector Pill */}
          <div className="relative">
            <button 
              onClick={toggleModelMenu}
              className="flex items-center gap-1 text-[10px] uppercase font-medium tracking-wider text-[#7b7f8d] pl-2 pr-1.5 py-0.5 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span className="truncate max-w-[80px]">{block.modelId.replace('gemini-', '').replace('mock-', '')}</span>
              <ChevronDown size={10} />
            </button>
            
            {showModelMenu && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-[#181b22] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                {models.map(m => (
                  <button
                    key={m.id}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 flex flex-col ${block.modelId === m.id ? 'text-[#3fa6ff]' : 'text-[#b2b5c3]'}`}
                    onClick={(e) => { e.stopPropagation(); onUpdateModel(block.id, m.id); setShowModelMenu(false); }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="text-[10px] opacity-60">{m.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3">
          {isImage ? (
            <div className="flex flex-col gap-2">
                 {/* Image Display */}
                <div className="group/img relative aspect-[4/5] w-full rounded-[20px] overflow-hidden bg-[#050607] border border-white/5">
                {block.content.url ? (
                    <>
                    <img 
                        src={block.content.url} 
                        alt="Generated" 
                        className="w-full h-full object-cover transition-opacity duration-300 opacity-90 group-hover/img:opacity-100" 
                        draggable={false}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <Maximize className="text-white" />
                    </div>
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#2d3039]">
                        <span className="text-xs text-center px-4">Ready to generate</span>
                    </div>
                )}
                </div>
                {/* Prompt Input */}
                 <div className="relative">
                    <textarea 
                        className="w-full bg-white/[0.03] text-[#b2b5c3] text-xs p-2 rounded-lg border border-white/5 resize-none focus:outline-none focus:border-[#3fa6ff]/50 transition-colors"
                        rows={2}
                        placeholder="Describe image..."
                        value={block.content.imagePrompt || ''}
                        onChange={(e) => handleTextChange(e, 'imagePrompt')}
                        onMouseDown={(e) => e.stopPropagation()} 
                    />
                </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
                {/* Prompt Template / System Prompt Config */}
                <div className="relative group/edit">
                     <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-[#505460] font-mono uppercase">Prompt Template</label>
                     </div>
                     <textarea 
                        className="w-full bg-white/[0.03] text-[#f8f8fb] text-xs font-mono p-2 rounded-lg border border-white/5 resize-none focus:outline-none focus:border-[#3fa6ff]/50 transition-colors"
                        rows={3}
                        value={block.content.promptTemplate || ''}
                        onChange={(e) => handleTextChange(e, 'promptTemplate')}
                        placeholder="Use {{input1}} to reference inputs"
                        onMouseDown={(e) => e.stopPropagation()} 
                     />
                </div>

                {/* Output Area */}
                <div className="bg-[#0a0c10] rounded-[16px] p-3 min-h-[80px] border border-white/5 max-h-[200px] overflow-y-auto custom-scrollbar">
                   <div className="text-[13px] font-mono text-[#b2b5c3] leading-relaxed whitespace-pre-wrap">
                     {block.content.text || <span className="text-[#2d3039] italic">Waiting for output...</span>}
                   </div>
                </div>
            </div>
          )}
          
          {/* Footer Controls */}
          <div className="mt-3 px-1 min-h-[20px] flex items-end justify-between">
            {isImage && (
              <p className="text-[10px] text-[#505460] line-clamp-1 flex-1 mr-4 font-mono">
                {block.content.caption ? `"${block.content.caption}"` : ''}
              </p>
            )}
            
            {/* Run Button */}
            <button 
              onClick={handleRunClick}
              disabled={block.status === 'running'}
              className={`
                w-8 h-8 ml-auto rounded-full flex items-center justify-center shadow-lg transition-all duration-300
                ${block.status === 'running' 
                  ? 'bg-[#181b22] border border-white/10 cursor-wait' 
                  : 'bg-[#f5f5f7] hover:bg-white text-black hover:scale-110 active:scale-95'
                }
              `}
            >
              {block.status === 'running' ? (
                <div className="w-3 h-3 border-2 border-t-transparent border-[#7b7f8d] rounded-full animate-spin" />
              ) : (
                <Play size={14} fill="currentColor" className="ml-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Context Actions (only when selected) */}
      {isSelected && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#181b22] border border-white/10 rounded-full px-2 py-1 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
           <button onClick={() => onDelete(block.id)} className="p-2 text-[#7b7f8d] hover:text-red-400 transition-colors">
             <Trash2 size={16} />
           </button>
           <div className="w-[1px] h-4 bg-white/10 mx-1" />
           <button className="p-2 text-[#7b7f8d] hover:text-white transition-colors">
             <MoreHorizontal size={16} />
           </button>
        </div>
      )}

      {/* Ports */}
      <div 
        className="absolute top-[60px] -left-1.5 w-3 h-3 rounded-full bg-[#111318] border-2 border-[#7b7f8d] hover:border-[#3fa6ff] hover:scale-125 transition-transform cursor-crosshair z-20" 
        title="Input" 
        data-port-type="input"
        data-block-id={block.id}
      />
      <div 
        className="absolute top-[60px] -right-1.5 w-3 h-3 rounded-full bg-[#111318] border-2 border-[#f5f5f7] hover:border-[#3fa6ff] hover:scale-125 transition-transform cursor-crosshair z-20" 
        title="Output" 
        data-port-type="output"
        data-block-id={block.id}
      />
    </div>
  );
};
