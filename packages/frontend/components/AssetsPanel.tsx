import React from 'react';
import { X, Image as ImageIcon, Download } from 'lucide-react';
import { Block } from '../types';

interface AssetsPanelProps {
  blocks: Block[];
  onClose: () => void;
}

export const AssetsPanel: React.FC<AssetsPanelProps> = ({ blocks, onClose }) => {
  // Filter only blocks with successful image outputs
  const assets = blocks.filter(b => b.type === 'IMAGE' && b.content.url);

  return (
    <div className="absolute top-14 bottom-6 left-20 w-80 bg-[#111318]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-40 flex flex-col animate-in slide-in-from-left-4 duration-200">
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ImageIcon size={16} className="text-[#3fa6ff]" />
          Project Assets
        </h2>
        <button onClick={onClose} className="text-[#7b7f8d] hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
        {assets.length === 0 ? (
          <div className="text-center text-[#505460] text-xs py-10">
            No generated images yet.
          </div>
        ) : (
          assets.map(block => (
            <div key={block.id} className="group relative rounded-xl overflow-hidden border border-white/5 bg-black">
              <img 
                src={block.content.url} 
                alt={block.content.caption} 
                className="w-full h-auto object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                <p className="text-[10px] text-white/80 line-clamp-1 mb-2">{block.title}</p>
                <a 
                  href={block.content.url} 
                  download={`nebula-${block.id}.png`}
                  className="self-end p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white backdrop-blur-md"
                  title="Download"
                >
                  <Download size={14} />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
