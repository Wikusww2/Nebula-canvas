import React from 'react';
import { Type, Image as ImageIcon, Video, Command } from 'lucide-react';
import { BlockType } from '../types';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAdd: (type: BlockType) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onAdd }) => {
  return (
    <div 
      className="fixed z-[100] w-[320px] bg-[#181b22] border border-white/10 rounded-[18px] shadow-[0_22px_65px_rgba(0,0,0,0.85)] p-2 animate-in zoom-in-95 duration-100"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 text-[10px] font-bold text-[#7b7f8d] uppercase tracking-wider">Add Block</div>
      
      <button onClick={() => onAdd('TEXT')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left">
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df] group-hover:bg-[#3fa6ff] group-hover:text-white transition-colors">
          <Type size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Text Generation</span>
          <span className="text-[11px] text-[#7b7f8d]">Prompt & Chat (Gemini)</span>
        </div>
        <span className="ml-auto text-[10px] text-[#505460] font-mono border border-white/5 px-1.5 py-0.5 rounded">T</span>
      </button>

      <button onClick={() => onAdd('IMAGE')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left">
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df] group-hover:bg-[#3fa6ff] group-hover:text-white transition-colors">
          <ImageIcon size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Image Generation</span>
          <span className="text-[11px] text-[#7b7f8d]">Stable Diff / Flux / Imagen</span>
        </div>
        <span className="ml-auto text-[10px] text-[#505460] font-mono border border-white/5 px-1.5 py-0.5 rounded">I</span>
      </button>

      <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left opacity-50 cursor-not-allowed">
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df]">
          <Video size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Video (Veo)</span>
          <span className="text-[11px] text-[#7b7f8d]">Coming Soon</span>
        </div>
        <span className="ml-auto text-[10px] text-[#505460] font-mono border border-white/5 px-1.5 py-0.5 rounded">V</span>
      </button>
      
      <div className="mt-2 pt-2 border-t border-white/5 px-3 py-2 flex items-center justify-between text-[10px] text-[#505460]">
        <span className="flex items-center gap-1">Navigate <Command size={10}/></span>
        <span className="flex items-center gap-1">Select ↵</span>
      </div>

      {/* Backdrop to close */}
      <div className="fixed inset-0 z-[-1]" onClick={onClose} />
    </div>
  );
};
