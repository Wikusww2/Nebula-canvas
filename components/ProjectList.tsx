import React from 'react';
import { Plus, Clock, Trash2, ArrowRight, FileBox } from 'lucide-react';
import { ProjectMetadata } from '../types';
import { THEME } from '../constants';

interface ProjectListProps {
  projects: ProjectMetadata[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onOpen, onCreate, onDelete }) => {
  return (
    <div className="min-h-screen bg-[#050607] text-[#f8f8fb] flex flex-col items-center pt-20 px-6 font-sans">
      <div className="w-full max-w-4xl">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
              Nebula Canvas
            </h1>
            <p className="text-[#7b7f8d]">Local AI Workflow Editor</p>
          </div>
          <button 
            onClick={onCreate}
            className="flex items-center gap-2 bg-[#f8f8fb] text-black px-5 py-2.5 rounded-full font-medium hover:bg-white hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            <Plus size={18} />
            New Project
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((proj) => (
            <div 
              key={proj.id}
              onClick={() => onOpen(proj.id)}
              className="group relative bg-[#111318] border border-white/5 rounded-2xl p-6 hover:border-white/10 hover:bg-[#161920] transition-all cursor-pointer shadow-lg hover:shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(proj.id); }}
                    className="p-2 hover:text-red-400 text-[#7b7f8d] transition-colors"
                 >
                   <Trash2 size={16} />
                 </button>
              </div>

              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-900/20 to-purple-900/20 flex items-center justify-center border border-white/5 mb-4 text-[#3fa6ff]">
                <FileBox size={20} />
              </div>
              
              <h3 className="text-lg font-medium mb-1 group-hover:text-blue-300 transition-colors">{proj.name}</h3>
              
              <div className="flex items-center gap-4 text-xs text-[#7b7f8d] mt-4">
                <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(proj.lastEdited).toLocaleDateString()}
                </span>
                <span>{proj.blockCount} blocks</span>
              </div>

              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                <ArrowRight className="text-[#3fa6ff]" size={20} />
              </div>
            </div>
          ))}

          {projects.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-[#7b7f8d] border border-dashed border-white/10 rounded-2xl">
              <p>No projects found.</p>
              <button onClick={onCreate} className="mt-4 text-[#3fa6ff] hover:underline">Create your first one</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
