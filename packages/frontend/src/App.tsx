import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Home,
  Layers,
  Box,
  Settings,
  Grid,
  Maximize,
  Share2,
  Type,
  Image as ImageIcon,
  MoreHorizontal,
  Trash2,
  RotateCcw,
  X,
  Plus,
  Cloud,
} from 'lucide-react';
import { MODEL_LIBRARY, ModelConfig } from '../../shared/src/models';

type BlockType = 'TEXT' | 'IMAGE';
type BlockStatus = 'idle' | 'running' | 'success' | 'error';

type Preferences = {
  showGrid: boolean;
  animateConnections: boolean;
  snapToGrid: boolean;
  showHints: boolean;
  showGlow: boolean;
};

type AssetItem = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

type ProjectMeta = {
  id: string;
  name: string;
  updatedAt: string;
};

interface BlockContent {
  text?: string;
  url?: string;
  caption?: string;
  generated?: string;
}

interface Block {
  id: string;
  type: BlockType;
  title: string;
  role: 'standard' | 'input' | 'output';
  systemPrompt?: string;
  x: number;
  y: number;
  width: number;
  content: BlockContent;
  status: BlockStatus;
  isStale: boolean;
  modelId: string;
}

interface Connection {
  id: string;
  from: string;
  to: string;
}

interface CanvasData {
  blocks: Block[];
  connections: Connection[];
}

const STORAGE_KEY = 'nebula-canvas-state-v1';
const PREF_KEY = 'nebula-preferences-v1';
const PROJECTS_KEY = 'nebula-projects-v1';
const ASSETS_KEY = 'nebula-assets-v1';
const GLOBAL_SYSTEM_PROMPT = `
You are Nebula Canvas, a deterministic, safety-first orchestration layer. Always:
- Respect user intent while keeping outputs concise and relevant to the active node (text or image).
- Preserve factual accuracy; avoid hallucinations; never fabricate citations.
- Be explicit about assumptions and avoid unsafe, harmful, or illegal content.
- Keep formatting clean: structured JSON for data outputs, clear prose for text, and precise prompts for images.
`.trim();

const THEME = {
  colors: {
    bg: '#050607',
    grid: '#20232a',
    panel: '#111318',
    panelElevated: '#181b22',
    border: 'rgba(255,255,255,0.06)',
    borderSelected: 'rgba(117, 187, 255, 0.65)',
    textPrimary: '#f8f8fb',
    textSecondary: '#b2b5c3',
    textMuted: '#7b7f8d',
    accent: '#3fa6ff',
    connection: 'rgba(255,255,255,0.28)',
    connectionActive: 'rgba(117, 187, 255, 0.85)',
  },
};

const MODEL_LOOKUP: Record<string, ModelConfig> = MODEL_LIBRARY.reduce((acc, model) => {
  acc[model.id] = model;
  return acc;
}, {} as Record<string, ModelConfig>);

const TEXT_MODELS = MODEL_LIBRARY.filter((m) => m.type === 'text');
const IMAGE_MODELS = MODEL_LIBRARY.filter((m) => m.type === 'image');

const INITIAL_DATA: CanvasData = {
  blocks: [
    {
      id: 'b1',
      type: 'IMAGE',
      role: 'standard',
      title: 'GLASS FLOWER',
      x: 150,
      y: 200,
      width: 320,
      systemPrompt: '',
      content: {
        url: 'https://images.unsplash.com/photo-1695503460699-299f02275466?q=80&w=3132&auto=format&fit=crop',
        caption: 'A radiant, translucent flower glows softly at its centre...',
      },
      status: 'idle',
      isStale: false,
      modelId: 'gemini-3-pro-image-preview',
    },
    {
      id: 'b2',
      type: 'TEXT',
      role: 'standard',
      title: 'COLOR PALETTE',
      x: 550,
      y: 250,
      width: 320,
      systemPrompt: '',
      content: {
        text: '#FFAD5D (orange)\n#FFFFFF (white)\n#0C0D20 (black)\n#A2A2D0 (light gray)\n#FFD500 (gold)',
      },
      status: 'idle',
      isStale: false,
      modelId: 'gpt-5-nano',
    },
    {
      id: 'b3',
      type: 'IMAGE',
      role: 'output',
      title: 'FLOWERS BLOOMING',
      x: 950,
      y: 220,
      width: 320,
      systemPrompt: '',
      content: {
        url: 'https://images.unsplash.com/photo-1663486333792-628b75c88998?q=80&w=2160&auto=format&fit=crop',
        caption: 'Variations generated based on the extracted palette.',
      },
      status: 'idle',
      isStale: false,
      modelId: 'gemini-3-pro-image-preview',
    },
  ],
  connections: [
    { id: 'c1', from: 'b1', to: 'b2' },
    { id: 'c2', from: 'b2', to: 'b3' },
  ],
};

const defaultPreferences: Preferences = {
  showGrid: true,
  animateConnections: true,
  snapToGrid: true,
  showHints: true,
  showGlow: true,
};

const defaultView = { x: 0, y: 0, zoom: 1 };
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';
const DEMO_CANVAS = INITIAL_DATA;
const CLEAN_CANVAS: CanvasData = { blocks: [], connections: [] };

interface IconButtonProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

const IconButton: React.FC<IconButtonProps> = ({ icon: Icon, active, onClick, title, className = '' }) => (
  <button
    aria-label={title}
    title={title}
    onClick={(e) => {
      e.stopPropagation();
      onClick?.();
    }}
    className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${active ? 'bg-white/10 text-white' : 'text-[#7b7f8d] hover:text-white hover:bg-white/5'} ${className}`}
  >
    <Icon size={18} />
  </button>
);

const GridBackground: React.FC<{ zoom: number; offset: { x: number; y: number } }> = ({ zoom, offset }) => (
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      backgroundImage: `radial-gradient(${THEME.colors.grid} 1.5px, transparent 0)`,
      backgroundSize: `${16 * zoom}px ${16 * zoom}px`,
      backgroundPosition: `${offset.x}px ${offset.y}px`,
      opacity: 0.85,
    }}
  >
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(63,166,255,0.08),transparent_35%)]" />
  </div>
);

const ConnectionLayer: React.FC<{
  connections: Connection[];
  blocks: Block[];
  zoom: number;
  animate: boolean;
  draft?: { fromId: string; x: number; y: number } | null;
}> = ({ connections, blocks, zoom, animate, draft }) => (
  <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
    {connections.map((conn) => {
      const from = blocks.find((b) => b.id === conn.from);
      const to = blocks.find((b) => b.id === conn.to);
      if (!from || !to) return null;

      const sx = from.x + from.width;
      const sy = from.y + 60;
      const ex = to.x;
      const ey = to.y + 60;
      const dist = Math.max(Math.abs(ex - sx) * 0.5, 80);
      const path = `M ${sx} ${sy} C ${sx + dist} ${sy}, ${ex - dist} ${ey}, ${ex} ${ey}`;
      const isActive = from.status === 'running' || to.status === 'running';

      return (
        <g key={conn.id}>
          <path
            d={path}
            fill="none"
            stroke={isActive ? THEME.colors.connectionActive : THEME.colors.connection}
            strokeWidth={2 / zoom}
            className={isActive ? 'connection-pulse' : undefined}
          />
          {animate && isActive && (
            <circle r={3 / zoom} fill="#fff">
              <animateMotion dur="1s" repeatCount="indefinite" path={path} />
            </circle>
          )}
        </g>
      );
    })}

    {draft && (() => {
      const from = blocks.find((b) => b.id === draft.fromId);
      if (!from) return null;
      const sx = from.x + from.width;
      const sy = from.y + 60;
      const ex = draft.x;
      const ey = draft.y;
      const dist = Math.max(Math.abs(ex - sx) * 0.5, 80);
      const path = `M ${sx} ${sy} C ${sx + dist} ${sy}, ${ex - dist} ${ey}, ${ex} ${ey}`;
      return (
        <g>
          <path d={path} fill="none" stroke="rgba(63,166,255,0.6)" strokeWidth={2 / zoom} strokeDasharray="4 4" />
          <circle cx={ex} cy={ey} r={4 / zoom} fill="rgba(63,166,255,0.8)" />
        </g>
      );
    })()}
  </svg>
);

interface BlockProps {
  block: Block;
  isSelected: boolean;
  preferences: Preferences;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>, block: Block) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  onEditText: (id: string, value: string) => void;
  onRename: (id: string) => void;
  onStartConnection: (id: string) => void;
  onCompleteConnection: (id: string) => void;
  connectingFrom: string | null;
  modelMenuOpen: boolean;
  onToggleModelMenu: (id: string) => void;
  onSelectModel: (blockId: string, modelId: string) => void;
  availableModels: ModelConfig[];
  onEditInstructions: (id: string, current: string) => void;
}

const BlockCard: React.FC<BlockProps> = ({
  block,
  isSelected,
  preferences,
  onMouseDown,
  onRun,
  onDelete,
  onEditText,
  onRename,
  onStartConnection,
  onCompleteConnection,
  connectingFrom,
  modelMenuOpen,
  onToggleModelMenu,
  onSelectModel,
  availableModels,
  onEditInstructions,
}) => {
  const isImage = block.type === 'IMAGE';
  const isOutput = block.role === 'output';
  const isInput = block.role === 'input';
  const isConnecting = connectingFrom === block.id;
  const modelLabel = MODEL_LOOKUP[block.modelId]?.displayName ?? block.modelId;
  const roleColor =
    block.role === 'output'
      ? 'bg-[#3fa6ff]/20 text-[#a7d8ff] border-[#3fa6ff]/40'
      : block.role === 'input'
        ? 'bg-[#7b7f8d]/20 text-[#d3d5df] border-[#7b7f8d]/40'
        : 'bg-white/5 text-[#7b7f8d] border-white/5';
  const roleLabel = block.role === 'output' ? 'Output' : block.role === 'input' ? 'Input' : '';
  const roleFrame =
    block.role === 'output'
      ? 'bg-gradient-to-b from-[#0b1628] to-[#0c1120] border-[#3fa6ff]/40 ring-2 ring-[#3fa6ff]/25'
      : block.role === 'input'
        ? 'bg-gradient-to-b from-[#0e0f14] to-[#0b0d12] border-white/15'
        : 'bg-[#111318]';

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, block)}
      className="absolute flex flex-col group transition-transform duration-75"
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        transform: 'translate3d(0,0,0)',
      }}
    >
      <div
        className={`absolute -inset-[1px] rounded-[24px] pointer-events-none transition-all duration-300 ${
          isSelected && preferences.showGlow
            ? 'opacity-100 shadow-[0_0_40px_rgba(117,187,255,0.35)] border border-[rgba(117,187,255,0.65)]'
            : 'opacity-0 border border-transparent'
        }`}
      />
      {block.role === 'output' && block.status === 'running' && (
        <div className="absolute -inset-[4px] rounded-[26px] pointer-events-none node-pulse-ring" />
      )}
      <div
        className={`relative flex flex-col overflow-hidden rounded-[24px]
        border shadow-[0_18px_40px_rgba(0,0,0,0.55)]
        transition-colors duration-200 ${isSelected ? 'border-white/10' : 'hover:border-white/10'} overflow-visible ${roleFrame}`}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 select-none">
          <div className="flex items-center gap-2">
            <span
              className="text-[15px] font-semibold text-[#f8f8fb] tracking-wide cursor-text"
              onDoubleClick={(e) => {
                e.stopPropagation();
                onRename(block.id);
              }}
            >
              {block.title}
            </span>
            {block.systemPrompt && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[#9bd0ff]">Guided</span>}
            {block.isStale && <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" title="Stale inputs" />}
            {block.status === 'error' && <div className="w-2 h-2 rounded-full bg-red-500" title="Execution failed" />}
            {block.status === 'running' && <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" title="Running" />}
            {block.role !== 'standard' && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleColor} uppercase font-semibold`}>
                {roleLabel}
              </span>
            )}
          </div>
          <div className="relative">
            <button
              className="text-[10px] uppercase font-medium tracking-wider text-[#7b7f8d] px-2 py-0.5 rounded-full bg-white/5 border border-white/5 hover:border-white/20"
              onClick={(e) => {
                e.stopPropagation();
                onToggleModelMenu(block.id);
              }}
            >
              {modelLabel}
            </button>
            {modelMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-52 max-h-64 overflow-y-auto bg-[#0f1116] border border-white/10 rounded-xl shadow-2xl z-20"
                onWheel={(e) => e.stopPropagation()}
              >
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectModel(block.id, model.id);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition ${
                      model.id === block.modelId ? 'bg-white/10 text-white' : 'text-[#b2b5c3] hover:bg-white/5'
                    }`}
                  >
                    <div className="font-medium text-white">{model.displayName}</div>
                    <div className="text-[11px] text-[#7b7f8d]">{model.id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-3">
          {isImage ? (
            <div
              className={`group/img relative aspect-[4/5] w-full rounded-[20px] overflow-hidden bg-[#050607] border ${
                isOutput ? 'border-[#3fa6ff]/40' : 'border-white/5'
              }`}
            >
              {isOutput && (
                <div className="absolute left-3 top-3 z-10 flex items-center gap-2 text-[10px] px-3 py-1 rounded-full bg-[#0f1a2e]/85 text-[#a7d8ff] border border-[#3fa6ff]/40 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-[#3fa6ff] animate-pulse" />
                  Final Image
                </div>
              )}
              {block.content.url ? (
                <>
                  <img
                    src={block.content.url}
                    alt="Generated"
                    className="w-full h-full object-cover transition-opacity duration-300 opacity-90 group-hover/img:opacity-100 select-none"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <Maximize className="text-white" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#2d3039]">
                  <ImageIcon size={48} />
                </div>
              )}
            </div>
          ) : (
            <>
              {isOutput ? (
                <div className="bg-gradient-to-b from-[#0b1628] via-[#0e1d33] to-[#0c1120] rounded-[18px] p-4 min-h-[160px] border border-[#3fa6ff]/30 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] uppercase tracking-wide text-[#a7d8ff]">Final Output</div>
                    <div className="text-[10px] text-[#7b7f8d]">{block.modelId}</div>
                  </div>
                  <div
                    className="bg-black/25 border border-[#3fa6ff]/20 rounded-[14px] p-3 max-h-[240px] overflow-auto shadow-inner"
                    onWheel={(e) => e.stopPropagation()}
                  >
                    <pre className="whitespace-pre-wrap text-[13px] font-mono text-[#dce7f5] leading-relaxed select-text">
                      {block.content.text?.trim() || 'Run upstream to see output here.'}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="bg-white/[0.02] rounded-[16px] p-4 min-h-[120px] border border-white/5 hover:bg-white/[0.04] transition-colors group/text space-y-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#7b7f8d] mb-1">Prompt</div>
                    <textarea
                      className="w-full h-full bg-transparent border-none resize-none text-[13px] font-mono text-[#b2b5c3] leading-relaxed focus:outline-none"
                      value={block.content.text === 'Enter prompt...' ? '' : block.content.text || ''}
                      placeholder="Enter prompt..."
                      onChange={(e) => onEditText(block.id, e.target.value)}
                      spellCheck={false}
                      onMouseDown={(ev) => ev.stopPropagation()}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-3 px-1 min-h-[20px] flex items-center justify-between gap-3">
            {isImage && (
              <p className="text-[12px] text-[#7b7f8d] leading-tight pr-3 overflow-hidden text-ellipsis">
                {block.content.caption || 'Ready to generate...'}
              </p>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRun(block.id);
              }}
              disabled={block.status === 'running'}
              className={`w-9 h-9 ml-auto rounded-full flex items-center justify-center shadow-lg transition-all ${
                block.status === 'running'
                  ? 'bg-[#181b22] border border-white/10 cursor-wait'
                  : 'bg-[#f5f5f7] hover:bg-white text-black hover:scale-105'
              }`}
            >
              {block.status === 'running' ? (
                <div className="w-4 h-4 border-2 border-t-transparent border-[#7b7f8d] rounded-full animate-spin" />
              ) : (
                <Play size={14} fill="currentColor" className="ml-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {isSelected && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#181b22] border border-white/10 rounded-full px-2 py-1 shadow-xl">
          <IconButton icon={Trash2} onClick={() => onDelete(block.id)} className="hover:text-red-400" title="Delete block" />
          <div className="w-[1px] h-4 bg-white/10 mx-1" />
          <IconButton icon={MoreHorizontal} title="Custom instructions" onClick={() => onEditInstructions(block.id, block.systemPrompt || '')} />
        </div>
      )}

      <div
        className="absolute top-[60px] -left-1.5 w-3 h-3 rounded-full bg-[#111318] border-2 border-[#7b7f8d] hover:border-[#3fa6ff] hover:scale-125 transition-transform cursor-crosshair z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          onCompleteConnection(block.id);
        }}
        title="Input"
      />
      <div
        className="absolute top-[60px] -right-1.5 w-3 h-3 rounded-full bg-[#111318] border-2 border-[#f5f5f7] hover:border-[#3fa6ff] hover:scale-125 transition-transform cursor-crosshair z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartConnection(block.id);
        }}
        style={{ boxShadow: isConnecting ? '0 0 0 4px rgba(63,166,255,0.3)' : 'none' }}
        title="Output"
      />
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, description, value, onChange }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex flex-col">
      <span className="text-sm text-[#f8f8fb]">{label}</span>
      <span className="text-[12px] text-[#7b7f8d]">{description}</span>
    </div>
    <button
      onClick={() => onChange(!value)}
      className={`w-12 h-6 rounded-full transition-colors relative ${value ? 'bg-[#3fa6ff]/80' : 'bg-white/10'}`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${value ? 'right-[4px]' : 'left-[4px]'}`}
      />
    </button>
  </div>
);

const SettingsPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  preferences: Preferences;
  onUpdate: (next: Preferences) => void;
}> = ({ open, onClose, preferences, onUpdate }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[90]" onMouseDown={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[90vw] bg-[#111318] border border-white/10 rounded-2xl shadow-[0_22px_65px_rgba(0,0,0,0.85)] p-5 z-[100]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Settings</h3>
            <p className="text-sm text-[#7b7f8d]">Personalize your canvas behaviour.</p>
          </div>
          <IconButton icon={X} onClick={onClose} title="Close settings" />
        </div>

        <div className="space-y-2">
          <ToggleRow
            label="Show grid"
            description="Toggle the dotted canvas grid."
            value={preferences.showGrid}
            onChange={(v) => onUpdate({ ...preferences, showGrid: v })}
          />
          <ToggleRow
            label="Animate connections"
            description="Pulse connections while blocks run."
            value={preferences.animateConnections}
            onChange={(v) => onUpdate({ ...preferences, animateConnections: v })}
          />
          <ToggleRow
            label="Snap to grid"
            description="Align blocks to a 16px grid while dragging."
            value={preferences.snapToGrid}
            onChange={(v) => onUpdate({ ...preferences, snapToGrid: v })}
          />
          <ToggleRow
            label="Glow on select"
            description="Highlight selected blocks with a neon glow."
            value={preferences.showGlow}
            onChange={(v) => onUpdate({ ...preferences, showGlow: v })}
          />
          <ToggleRow
            label="Keyboard hints"
            description="Show the bottom shortcuts helper."
            value={preferences.showHints}
            onChange={(v) => onUpdate({ ...preferences, showHints: v })}
          />
        </div>
      </div>
    </>
  );
};

const TopBar: React.FC<{
  onFit: () => void;
  onToggleGrid: () => void;
  showGrid: boolean;
  onResetView: () => void;
  onRunSelected: () => void;
  onShare: () => void;
  onHome: () => void;
  projectName: string;
}> = ({ onFit, onToggleGrid, showGrid, onResetView, onRunSelected, onShare, onHome, projectName }) => (
  <div className="fixed top-0 left-0 w-full h-14 z-50 flex items-center justify-between px-6 pointer-events-none">
    <div className="absolute inset-0 bg-gradient-to-b from-[#050607] to-transparent opacity-90" />
    <div className="pointer-events-auto relative z-10 flex items-center gap-4">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onHome();
        }}
        className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center border border-white/5 hover:bg-white/10"
        title="Home"
      >
        <Home size={16} />
      </button>
      <div>
        <h1 className="text-sm font-medium text-[#f8f8fb]">{projectName}</h1>
        <div className="text-[10px] text-[#7b7f8d] flex items-center gap-1">
          Last edited moments ago <div className="w-1 h-1 rounded-full bg-green-500" />
        </div>
      </div>
    </div>

    <div className="pointer-events-auto relative z-10 flex items-center gap-2 bg-[#111318]/80 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-xl">
      <IconButton icon={Play} title="Run selected block (Ctrl/Cmd + Enter)" onClick={onRunSelected} />
      <IconButton icon={Maximize} title="Fit to content" onClick={onFit} />
      <IconButton icon={Grid} title="Toggle grid" active={showGrid} onClick={onToggleGrid} />
      <div className="w-[1px] h-4 bg-white/10 mx-1" />
      <IconButton icon={RotateCcw} title="Reset view" onClick={onResetView} />
    </div>

    <div className="pointer-events-auto relative z-10 flex items-center gap-3">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onShare();
        }}
        className="px-4 py-1.5 bg-[#1e2129] hover:bg-[#282c36] text-xs font-medium text-white rounded-full border border-white/10 transition-colors flex items-center gap-2"
      >
        <Share2 size={12} /> Share
      </button>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/20" />
    </div>
  </div>
);

const Sidebar: React.FC<{
  onNavigateAssets: () => void;
  onAdd: (type: BlockType) => void;
  onOpenSettings: () => void;
  mode: 'home' | 'canvas';
}> = ({ onNavigateAssets, onAdd, onOpenSettings, mode }) => (
  <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4 pointer-events-none">
    <div className="pointer-events-auto bg-[#0a0c10]/90 backdrop-blur-xl border border-white/10 rounded-full py-3 px-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)] flex flex-col gap-2 w-14 items-center">
      <IconButton icon={Cloud} title="Assets" active={mode === 'home'} onClick={onNavigateAssets} />
      <IconButton icon={Layers} active={mode === 'canvas'} title="Canvas" />
      <IconButton icon={Box} onClick={() => onAdd('TEXT')} title="Add text block (T)" />
      <IconButton icon={ImageIcon} onClick={() => onAdd('IMAGE')} title="Add image block (I)" />
      <div className="w-6 h-[1px] bg-white/10 my-1" />
      <IconButton icon={Settings} onClick={onOpenSettings} title="Settings" />
    </div>
  </div>
);

const ContextMenu: React.FC<{
  x: number;
  y: number;
  onClose: () => void;
  onAdd: (type: BlockType, role?: Block['role']) => void;
}> = ({ x, y, onClose, onAdd }) => (
  <>
    <div className="fixed inset-0 z-[90]" onMouseDown={onClose} />
    <div
      className="fixed z-[100] w-[320px] bg-[#181b22] border border-white/10 rounded-[18px] shadow-[0_22px_65px_rgba(0,0,0,0.85)] p-2"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 text-[10px] font-bold text-[#7b7f8d] uppercase tracking-wider">Add Block</div>

      <button
        onClick={() => onAdd('TEXT')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df] group-hover:bg-[#3fa6ff] group-hover:text-white transition-colors">
          <Type size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Text</span>
          <span className="text-[11px] text-[#7b7f8d]">Prompt & Chat</span>
        </div>
        <span className="ml-auto text-[10px] text-[#505460] font-mono border border-white/5 px-1.5 py-0.5 rounded">T</span>
      </button>

      <button
        onClick={() => onAdd('IMAGE')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df] group-hover:bg-[#3fa6ff] group-hover:text-white transition-colors">
          <ImageIcon size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Image</span>
          <span className="text-[11px] text-[#7b7f8d]">Flux & Stable Diff</span>
        </div>
        <span className="ml-auto text-[10px] text-[#505460] font-mono border border-white/5 px-1.5 py-0.5 rounded">I</span>
      </button>

      <div className="px-3 pt-3 pb-2 text-[10px] font-bold text-[#7b7f8d] uppercase tracking-wider">Special</div>
      <button
        onClick={() => onAdd('TEXT', 'input')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df] group-hover:bg-[#3fa6ff] group-hover:text-white transition-colors">
          <Type size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Text Input</span>
          <span className="text-[11px] text-[#7b7f8d]">Pinned context</span>
        </div>
      </button>
      <button
        onClick={() => onAdd('IMAGE', 'input')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df] group-hover:bg-[#3fa6ff] group-hover:text-white transition-colors">
          <ImageIcon size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Image Input</span>
          <span className="text-[11px] text-[#7b7f8d]">Upload reference</span>
        </div>
      </button>
      <button
        onClick={() => onAdd('TEXT', 'output')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df] group-hover:bg-[#3fa6ff] group-hover:text-white transition-colors">
          <Type size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Text Output</span>
          <span className="text-[11px] text-[#7b7f8d]">Final chat answer</span>
        </div>
      </button>
      <button
        onClick={() => onAdd('IMAGE', 'output')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 group transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-[#252830] flex items-center justify-center text-[#d3d5df] group-hover:bg-[#3fa6ff] group-hover:text-white transition-colors">
          <ImageIcon size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#f8f8fb]">Image Output</span>
          <span className="text-[11px] text-[#7b7f8d]">Final render</span>
        </div>
      </button>

      <div className="mt-2 pt-2 border-t border-white/5 px-3 py-2 flex items-center justify-between text-[10px] text-[#505460]">
        <span className="flex items-center gap-1">Navigate</span>
        <span className="flex items-center gap-1">Select Enter</span>
      </div>
    </div>
  </>
);

const Toast: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed bottom-6 right-6 bg-[#111318] text-white text-sm px-4 py-2 rounded-xl border border-white/10 shadow-lg z-[120]">
    {message}
  </div>
);

const HomeScreen: React.FC<{
  projects: ProjectMeta[];
  onCreateBlank: () => void;
  onCreateDemo: () => void;
  onOpen: (project: ProjectMeta) => void;
  onRename: (project: ProjectMeta) => void;
  onDelete: (project: ProjectMeta) => void;
  onDuplicate: (project: ProjectMeta) => void;
}> = ({ projects, onCreateBlank, onCreateDemo, onOpen, onRename, onDelete, onDuplicate }) => {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'recent' | 'name'>('recent');

  const filtered = projects
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return (
    <div className="w-full min-h-screen bg-[#050607] text-white flex flex-col items-center px-6 py-10 overflow-y-auto">
      <div className="max-w-6xl w-full flex flex-col gap-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-[#0a0c12] via-[#0c1120] to-[#0a0c12] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-[#3fa6ff33] blur-3xl" />
          <div className="absolute -right-16 -bottom-12 h-40 w-40 rounded-full bg-[#8b5cf633] blur-3xl" />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-[#7b7f8d]">Nebula Canvas</p>
              <h1 className="text-3xl font-semibold text-white">Your canvases</h1>
              <p className="text-sm text-[#b2b5c3] mt-1">Organize, explore, and launch your AI workflows.</p>
            </div>
            <div className="flex gap-2 items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search canvases..."
                className="bg-[#0f1116]/80 border border-white/10 text-sm px-3 py-2 rounded-xl text-white focus:outline-none focus:border-white/20"
              />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'recent' | 'name')}
                className="bg-[#0f1116]/80 border border-white/10 text-sm px-3 py-2 rounded-xl text-white focus:outline-none focus:border-white/20"
                title="Sort canvases"
              >
                <option value="recent">Recent</option>
                <option value="name">Name</option>
              </select>
              <button
                className="px-3 py-2 rounded-xl bg-[#0f1116]/80 border border-white/10 text-sm text-white hover:bg-[#181b22] transition"
                onClick={() => setQuery('')}
              >
                Clear
              </button>
              <button
                className="px-4 py-2 rounded-xl bg-white text-black text-sm font-medium hover:scale-[1.02] transition shadow-lg"
                onClick={onCreateBlank}
              >
                <Plus size={16} className="inline mr-2" /> New canvas
              </button>
              <button
                className="px-4 py-2 rounded-xl bg-[#111318] border border-white/10 text-sm text-white hover:bg-[#181b22] transition"
                onClick={onCreateDemo}
              >
                Sample template
              </button>
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-[#b2b5c3]">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
              <div className="text-xs text-[#7b7f8d]">Total canvases</div>
              <div className="text-lg text-white font-semibold">{projects.length}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
              <div className="text-xs text-[#7b7f8d]">Sort</div>
              <div className="text-lg text-white font-semibold capitalize">{sortKey}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 col-span-2 sm:col-span-1">
              <div className="text-xs text-[#7b7f8d]">Search</div>
              <div className="text-lg text-white font-semibold truncate">{query || '—'}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 col-span-2 sm:col-span-1">
              <div className="text-xs text-[#7b7f8d]">Tip</div>
              <div className="text-lg text-white font-semibold">Drag & connect freely</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 && (
            <div className="col-span-full text-[#7b7f8d] bg-[#0a0c10] border border-white/5 rounded-2xl p-6 text-center">
              No canvases match. Create or clear the search.
            </div>
          )}
          {filtered.map((project) => (
            <div
              key={project.id}
              className="bg-[#111318] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-white font-medium truncate">{project.name}</span>
                <span className="text-[10px] text-[#7b7f8d]">{new Date(project.updatedAt).toLocaleString()}</span>
              </div>
              <p className="text-sm text-[#7b7f8d]">Manage and open this canvas.</p>
              <div className="flex gap-2 pt-1">
                <button
                  className="flex-1 px-3 py-2 rounded-xl bg-white text-black text-sm font-medium hover:scale-[1.01] transition"
                  onClick={() => onOpen(project)}
                >
                  Open
                </button>
                <button
                  className="px-3 py-2 rounded-xl bg-[#0f1116] border border-white/10 text-xs text-white hover:bg-[#181b22] transition"
                  onClick={() => onRename(project)}
                >
                  Rename
                </button>
                <button
                  className="px-3 py-2 rounded-xl bg-[#0f1116] border border-white/10 text-xs text-white hover:bg-[#181b22] transition"
                  onClick={() => onDuplicate(project)}
                >
                  Duplicate
                </button>
                <button
                  className="px-3 py-2 rounded-xl bg-[#1a0f0f] border border-red-400/40 text-xs text-red-200 hover:bg-[#220c0c] transition"
                  onClick={() => onDelete(project)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AssetsPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  assets: AssetItem[];
  onUploadFile: (file: File) => void;
  onAddUrl: (url: string) => void;
  onApply: (asset: AssetItem) => void;
  canApply: boolean;
}> = ({ open, onClose, assets, onUploadFile, onAddUrl, onApply, canApply }) => {
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[140]" onMouseDown={onClose} />
      <div
        className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0a0c10] border-l border-white/10 shadow-2xl z-[150] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <div className="text-sm text-[#7b7f8d]">Assets</div>
            <div className="text-lg font-semibold text-white">Session Library</div>
          </div>
          <IconButton icon={X} title="Close" onClick={onClose} />
        </div>

        <div className="px-4 py-3 border-b border-white/10 space-y-2">
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-white text-black text-sm font-medium hover:scale-[1.02] transition shadow"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadFile(file);
              }}
            />
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste image URL"
              className="flex-1 bg-[#111318] border border-white/10 text-sm px-3 py-2 rounded-lg text-white focus:outline-none focus:border-white/20"
            />
            <button
              className="px-3 py-2 rounded-lg bg-[#111318] border border-white/10 text-sm text-white hover:bg-[#181b22] transition"
              onClick={() => {
                onAddUrl(urlInput.trim());
                setUrlInput('');
              }}
            >
              Add
            </button>
          </div>
          <div className="text-xs text-[#7b7f8d]">Assets are stored locally for this session.</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {assets.length === 0 && (
            <div className="text-[#7b7f8d] text-sm bg-[#0f1116] border border-white/10 rounded-xl p-4">
              No assets yet. Upload or paste a URL to start.
            </div>
          )}
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex gap-3 items-center bg-[#0f1116] border border-white/10 rounded-xl p-3 hover:border-white/20 transition"
            >
              <img src={asset.url} alt={asset.name} className="w-16 h-16 rounded-lg object-cover border border-white/10" />
              <div className="flex-1 overflow-hidden">
                <div className="text-sm text-white truncate">{asset.name}</div>
                <div className="text-[11px] text-[#7b7f8d]">{new Date(asset.createdAt).toLocaleString()}</div>
              </div>
              <button
                disabled={!canApply}
                onClick={() => onApply(asset)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  canApply
                    ? 'bg-white text-black hover:scale-[1.02] shadow'
                    : 'bg-[#111318] text-[#7b7f8d] cursor-not-allowed'
                }`}
              >
                Apply
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default function App() {
  const [mode, setMode] = useState<'home' | 'canvas'>('home');
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectMeta | null>(null);
  const [data, setData] = useState<CanvasData>(CLEAN_CANVAS);
  const dataRef = useRef<CanvasData>(CLEAN_CANVAS);
  const [view, setView] = useState(defaultView);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [draftConnection, setDraftConnection] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [modelMenu, setModelMenu] = useState<string | null>(null);
  const [instructionsModal, setInstructionsModal] = useState<{ id: string; value: string } | null>(null);
  const isDraggingCanvas = useRef(false);
  const canvasDragStart = useRef({ x: 0, y: 0 });
  const blockDrag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const spaceHeld = useRef(false);
  const toastTimer = useRef<number | null>(null);
  const storageKey = currentProject ? `${STORAGE_KEY}-${currentProject.id}` : STORAGE_KEY;
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  const updateData = useCallback((updater: (prev: CanvasData) => CanvasData) => {
    setData((prev) => {
      const next = updater(prev);
      dataRef.current = next;
      return next;
    });
  }, []);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => ({
      x: (clientX - view.x) / view.zoom,
      y: (clientY - view.y) / view.zoom,
    }),
    [view],
  );

  const snap = useCallback(
    (value: number) => (preferences.snapToGrid ? Math.round(value / 16) * 16 : value),
    [preferences.snapToGrid],
  );

  const addBlock = useCallback(
    (type: BlockType, position?: { x: number; y: number }, role: Block['role'] = 'standard') => {
      const basePos = position ?? screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
      const newBlock: Block = {
        id: `b-${Date.now()}`,
        type,
        title: type === 'TEXT' ? 'New Prompt' : 'New Image',
        role,
        systemPrompt: '',
        x: snap(basePos.x),
        y: snap(basePos.y),
        width: 320,
        content: type === 'TEXT' ? { text: '' } : { url: '', caption: 'Ready to generate...' },
        status: 'idle',
        isStale: true,
        modelId: type === 'TEXT' ? 'gpt-5-nano' : 'gemini-3-pro-image-preview',
      };

      updateData((prev) => ({ ...prev, blocks: [...prev.blocks, newBlock] }));
      setSelectedIds(new Set([newBlock.id]));
      setContextMenu(null);
    },
    [screenToWorld, snap, updateData],
  );

  const deleteBlock = useCallback(
    (id: string) => {
      updateData((prev) => ({
        blocks: prev.blocks.filter((b) => b.id !== id),
        connections: prev.connections.filter((c) => c.from !== id && c.to !== id),
      }));
      setSelectedIds(new Set());
    },
    [updateData],
  );

  const showToast = useCallback((message: string, duration = 2000) => {
    setToast(message);
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), duration);
  }, []);

  const setBlockModel = useCallback(
    (blockId: string, modelId: string) => {
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, modelId } : b)),
      }));
      setModelMenu(null);
      showToast('Model updated');
    },
    [showToast, updateData],
  );

  const markDownstreamStale = useCallback(
    (blockId: string) => {
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (prev.connections.some((c) => c.from === blockId && c.to === b.id) ? { ...b, isStale: true } : b)),
      }));
    },
    [updateData],
  );

  const runBlock = useCallback(
    async (blockId: string) => {
      const visited = new Set<string>();

      const runWithDeps = async (id: string): Promise<void> => {
        if (visited.has(id)) return;
        visited.add(id);

        const current = dataRef.current;
        const block = current.blocks.find((b) => b.id === id);
        if (!block) return;

        const upstreamIds = current.connections.filter((c) => c.to === id).map((c) => c.from);
        const forceUpstream = block.role === 'output';
        for (const upstreamId of upstreamIds) {
          const upstream = current.blocks.find((b) => b.id === upstreamId);
          if (upstream && (forceUpstream || upstream.isStale || upstream.status !== 'success')) {
            await runWithDeps(upstreamId);
          }
        }

        updateData((prev) => ({
          ...prev,
          blocks: prev.blocks.map((b) => (b.id === id ? { ...b, status: 'running' } : b)),
        }));

        try {
          const latest = dataRef.current;
          const latestBlock = latest.blocks.find((b) => b.id === id) ?? block;
          const inputs = upstreamIds
            .map((upId) => latest.blocks.find((b) => b.id === upId)?.content)
            .filter(Boolean) as BlockContent[];

          // Build prompt from upstream + current content (text and image hints)
          const upstreamText = inputs.map((i) => i.generated || i.text).filter(Boolean).join('\n');
          const upstreamImagesList = inputs
            .map((i) => (i.url ? `Reference image: ${i.url}${i.caption ? ` (${i.caption})` : ''}` : ''))
            .filter(Boolean)
            .join('\n');
          // Only keep small, safe image hints (avoid huge data URLs)
          const upstreamImages = inputs
            .map((i) => i.url && i.url.startsWith('http') ? `Image: ${i.caption || ''} ${i.url}`.trim() : '')
            .filter(Boolean)
            .slice(0, 2) // cap to 2 images to avoid overloading context
            .join('\n');

          const basePrompt =
            latestBlock.type === 'TEXT'
              ? [latestBlock.content.text || '', upstreamText, upstreamImages ? `\nUpstream images:\n${upstreamImages}` : '']
                  .filter(Boolean)
                  .join('\n')
              : [
                  upstreamText || '',
                  upstreamImagesList ? `\n${upstreamImagesList}` : '',
                  latestBlock.content.caption || '',
                  latestBlock.content.text || '',
                ]
                  .filter(Boolean)
                  .join('\n')
                  .trim();

          const nodeSystemPrompt = [GLOBAL_SYSTEM_PROMPT, latestBlock.systemPrompt?.trim()].filter(Boolean).join('\n\n');
          const promptSegments = [nodeSystemPrompt, basePrompt].filter(Boolean);
          const promptBaseRaw = promptSegments.join('\n\n');
          // Truncate to protect model context limits
          const promptBase = promptBaseRaw.length > 6000 ? `${promptBaseRaw.slice(0, 6000)}\n...[truncated]` : promptBaseRaw;

          let result: BlockContent = {};
          if (latestBlock.type === 'TEXT') {
            if (latestBlock.role === 'output') {
              // For text output nodes, surface upstream text directly (no extra API call).
              const finalText = upstreamText || latestBlock.content.generated || latestBlock.content.text || 'Run upstream to see output.';
              result = { text: finalText, generated: finalText };
            } else {
              const resp = await fetch(`${API_BASE}/api/generate-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: promptBase,
                  modelId: latestBlock.modelId,
                  systemPrompt: nodeSystemPrompt,
                  reasoning: { effort: 'high' },
                }),
              });
              const raw = await resp.text();
              const data = raw ? (() => { try { return JSON.parse(raw); } catch { return { error: raw }; } })() : {};
              if (!resp.ok) throw new Error((data as any).error || raw || 'Text generation failed');
              // Keep prompt intact; store generated separately
              result = { generated: (data as any).text };
            }
          } else {
            // Always generate for image nodes (including outputs) using upstream text as prompt.
            const resp = await fetch(`${API_BASE}/api/generate-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: promptBase, modelId: latestBlock.modelId, systemPrompt: nodeSystemPrompt }),
            });
            const raw = await resp.text();
            const data = raw ? (() => { try { return JSON.parse(raw); } catch { return { error: raw }; } })() : {};
            if (!resp.ok) throw new Error((data as any).error || raw || 'Image generation failed');
            result = { url: (data as any).url, caption: latestBlock.content.caption || 'Generated image' };
          }

          updateData((prev) => {
            const downstreamIds = prev.connections.filter((c) => c.from === id).map((c) => c.to);
            return {
              ...prev,
              blocks: prev.blocks.map((b) => {
                if (b.id === id) {
                  return {
                    ...b,
                    status: 'success',
                    isStale: false,
                    content: { ...b.content, ...result },
                  };
                }
                if (downstreamIds.includes(b.id)) {
                  return { ...b, isStale: true };
                }
                return b;
              }),
            };
          });

          // Auto-propagate results into direct downstream output nodes so users don't have to click run
          updateData((prev) => {
            const downstreamIds = prev.connections.filter((c) => c.from === id).map((c) => c.to);
            return {
              ...prev,
              blocks: prev.blocks.map((b) => {
                if (downstreamIds.includes(b.id) && b.role === 'output') {
                  if (latestBlock.type === 'TEXT') {
                    const textVal = result.generated || result.text || b.content.text;
                    return { ...b, status: 'success', isStale: false, content: { ...b.content, text: textVal, generated: textVal } };
                  }
                  if (latestBlock.type === 'IMAGE') {
                    const urlVal = result.url || b.content.url;
                    return { ...b, status: 'success', isStale: false, content: { ...b.content, url: urlVal, caption: result.caption || b.content.caption } };
                  }
                }
                return b;
              }),
            };
          });
        } catch (error: any) {
          updateData((prev) => ({
            ...prev,
            blocks: prev.blocks.map((b) => (b.id === id ? { ...b, status: 'error' } : b)),
          }));
          console.error(error);
          showToast(`Generation failed. Is the backend running at ${API_BASE}?`);
        }

        const downstreamIds = dataRef.current.connections.filter((c) => c.from === id).map((c) => c.to);
        for (const downId of downstreamIds) {
          await runWithDeps(downId);
        }
      };

      await runWithDeps(blockId);
    },
    [showToast, updateData],
  );

  const handleWheel = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    const isFormElement =
      target.closest('textarea') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('[contenteditable="true"]');
    if (isFormElement) return;

    if (e.cancelable) e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const { clientX, clientY } = e;
    setView((v) => {
      const nextZoom = Math.min(Math.max(0.2, v.zoom + delta), 3);
      if (nextZoom === v.zoom) return v;

      // Keep the point under the cursor anchored while zooming.
      const worldX = (clientX - v.x) / v.zoom;
      const worldY = (clientY - v.y) / v.zoom;
      const nextX = clientX - worldX * nextZoom;
      const nextY = clientY - worldY * nextZoom;

      return { ...v, zoom: nextZoom, x: nextX, y: nextY };
    });
    setContextMenu(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (contextMenu) setContextMenu(null);
    setConnectingFrom(null);
    setModelMenu(null);
    const target = e.target as HTMLElement;
    if (e.button === 0 && (target.id === 'canvas-bg' || spaceHeld.current)) {
      isDraggingCanvas.current = true;
      canvasDragStart.current = { x: e.clientX, y: e.clientY };
      document.body.style.cursor = 'grabbing';
    } else if ((e.target as HTMLElement).id === 'canvas-bg') {
      setSelectedIds(new Set());
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas.current) {
      const dx = e.clientX - canvasDragStart.current.x;
      const dy = e.clientY - canvasDragStart.current.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      canvasDragStart.current = { x: e.clientX, y: e.clientY };
    } else if (blockDrag.current) {
      const { id, offsetX, offsetY } = blockDrag.current;
      const world = screenToWorld(e.clientX, e.clientY);
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === id ? { ...b, x: world.x - offsetX, y: world.y - offsetY } : b)),
      }));
    } else if (connectingFrom) {
      const world = screenToWorld(e.clientX, e.clientY);
      setDraftConnection({ fromId: connectingFrom, x: world.x, y: world.y });
    }
  };

  const handleMouseUp = () => {
    if (blockDrag.current && preferences.snapToGrid) {
      const { id } = blockDrag.current;
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === id ? { ...b, x: snap(b.x), y: snap(b.y) } : b)),
      }));
    }
    isDraggingCanvas.current = false;
    blockDrag.current = null;
    document.body.style.cursor = 'default';
    setDraftConnection(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
    setConnectingFrom(null);
    setDraftConnection(null);
  };

  const startBlockDrag = (e: React.MouseEvent<HTMLDivElement>, block: Block) => {
    // Don't drag when interacting with text inputs
    const target = e.target as HTMLElement;
    if (target.closest('textarea') || target.closest('input') || target.closest('[contenteditable="true"]')) {
      return;
    }
    e.stopPropagation();
    setConnectingFrom(null);
    setDraftConnection(null);
    const world = screenToWorld(e.clientX, e.clientY);
    blockDrag.current = {
      id: block.id,
      offsetX: world.x - block.x,
      offsetY: world.y - block.y,
    };
    setSelectedIds(new Set([block.id]));
    document.body.style.cursor = 'grabbing';
  };

  const onEditText = useCallback(
    (id: string, value: string) => {
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === id ? { ...b, content: { ...b.content, text: value }, isStale: false, status: 'idle' } : b)),
      }));
      markDownstreamStale(id);
    },
    [markDownstreamStale, updateData],
  );
  const onEditInstructions = useCallback(
    (id: string, value: string) => {
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === id ? { ...b, systemPrompt: value } : b)),
      }));
      markDownstreamStale(id);
      setInstructionsModal(null);
      showToast('Custom instructions saved');
    },
    [markDownstreamStale, showToast, updateData],
  );

  const onRename = useCallback(
    (id: string) => {
      const block = dataRef.current.blocks.find((b) => b.id === id);
      const next = window.prompt('Rename block', block?.title ?? '');
      if (next && next.trim().length > 0) {
        updateData((prev) => ({
          ...prev,
          blocks: prev.blocks.map((b) => (b.id === id ? { ...b, title: next.trim() } : b)),
        }));
      }
    },
    [updateData],
  );
  const addConnection = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      updateData((prev) => {
        const exists = prev.connections.some((c) => c.from === fromId && c.to === toId);
        if (exists) return prev;
        return {
          ...prev,
          connections: [...prev.connections, { id: `c-${Date.now()}`, from: fromId, to: toId }],
        };
      });
    },
    [updateData],
  );

  const fitToContent = useCallback(() => {
    if (!dataRef.current.blocks.length) {
      setView(defaultView);
      return;
    }
    const xs = dataRef.current.blocks.map((b) => b.x);
    const ys = dataRef.current.blocks.map((b) => b.y);
    const widths = dataRef.current.blocks.map((b) => b.width);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x, i) => x + widths[i]));
    const maxY = Math.max(...ys.map((y, i) => y + 260));
    const padding = 160;
    const worldWidth = maxX - minX + padding * 2;
    const worldHeight = maxY - minY + padding * 2;
    const zoomX = window.innerWidth / worldWidth;
    const zoomY = window.innerHeight / worldHeight;
    const newZoom = Math.min(Math.max(0.35, Math.min(zoomX, zoomY)), 2.5);
    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;
    setView({
      x: window.innerWidth / 2 - centerX * newZoom,
      y: window.innerHeight / 2 - centerY * newZoom,
      zoom: newZoom,
    });
  }, []);

  const resetView = useCallback(() => setView(defaultView), []);

  const onShare = useCallback(() => {
    const payload = JSON.stringify({ data: dataRef.current, view }, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(payload).then(() => showToast('Canvas JSON copied to clipboard'));
    } else {
      showToast('Clipboard not available');
    }
  }, [showToast, view]);

  const addAssetFromFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = typeof reader.result === 'string' ? reader.result : '';
        const newAsset: AssetItem = {
          id: `a-${Date.now()}`,
          name: file.name,
          url,
          createdAt: new Date().toISOString(),
        };
        setAssets((prev) => [newAsset, ...prev].slice(0, 50));
        showToast('Asset added');
      };
      reader.readAsDataURL(file);
    },
    [showToast],
  );

  const addAssetFromUrl = useCallback(
    (url: string) => {
      if (!url) return;
      const newAsset: AssetItem = {
        id: `a-${Date.now()}`,
        name: 'Image',
        url,
        createdAt: new Date().toISOString(),
      };
      setAssets((prev) => [newAsset, ...prev].slice(0, 50));
      showToast('Asset added from URL');
    },
    [showToast],
  );

  const applyAssetToSelection = useCallback(
    (asset: AssetItem) => {
      const selectedId = Array.from(selectedIds)[0];
      if (!selectedId) {
        showToast('Select an image block to apply');
        return;
      }
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === selectedId && b.type === 'IMAGE'
            ? { ...b, content: { ...b.content, url: asset.url, caption: asset.name }, status: 'success', isStale: false }
            : b,
        ),
      }));
      showToast('Asset applied to block');
    },
    [selectedIds, showToast, updateData],
  );

  const runSelected = useCallback(() => {
    const first = Array.from(selectedIds)[0];
    if (first) {
      runBlock(first);
    } else {
      showToast('Select a block to run');
    }
  }, [runBlock, selectedIds, showToast]);

  const getProjectState = useCallback((project: ProjectMeta) => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}-${project.id}`);
      if (!raw) return { data: CLEAN_CANVAS, view: defaultView };
      const parsed = JSON.parse(raw);
      return {
        data: parsed.data ?? CLEAN_CANVAS,
        view: parsed.view ?? defaultView,
      };
    } catch {
      return { data: CLEAN_CANVAS, view: defaultView };
    }
  }, []);

  const openProject = useCallback(
    (project: ProjectMeta) => {
      setCurrentProject(project);
      setMode('canvas');
      const state = getProjectState(project);
      setData(state.data);
      dataRef.current = state.data;
      setView(state.view);
    },
    [getProjectState],
  );

  const createProject = useCallback(
    (name: string, seed: CanvasData) => {
      const project: ProjectMeta = { id: `p-${Date.now()}`, name, updatedAt: new Date().toISOString() };
      const nextProjects = [...projects, project];
      setProjects(nextProjects);
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(nextProjects));
      setCurrentProject(project);
      setData(seed);
      dataRef.current = seed;
      setView(defaultView);
      setMode('canvas');
      localStorage.setItem(`${STORAGE_KEY}-${project.id}`, JSON.stringify({ data: seed, view: defaultView }));
    },
    [projects],
  );

  const renameProject = useCallback(
    (project: ProjectMeta) => {
      const nextName = window.prompt('Rename canvas', project.name)?.trim();
      if (!nextName) return;
      const updated = projects.map((p) => (p.id === project.id ? { ...p, name: nextName, updatedAt: new Date().toISOString() } : p));
      setProjects(updated);
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
      if (currentProject?.id === project.id) {
        setCurrentProject({ ...project, name: nextName });
      }
    },
    [currentProject, projects],
  );

  const deleteProject = useCallback(
    (project: ProjectMeta) => {
      const confirmDelete = window.confirm(`Delete "${project.name}"? This removes the saved canvas from this device.`);
      if (!confirmDelete) return;
      const next = projects.filter((p) => p.id !== project.id);
      setProjects(next);
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
      localStorage.removeItem(`${STORAGE_KEY}-${project.id}`);
      if (currentProject?.id === project.id) {
        setCurrentProject(null);
        setMode('home');
        setData(CLEAN_CANVAS);
        dataRef.current = CLEAN_CANVAS;
        setView(defaultView);
      }
    },
    [currentProject, projects],
  );

  const duplicateProject = useCallback(
    (project: ProjectMeta) => {
      const state = getProjectState(project);
      createProject(`${project.name} copy`, state.data);
    },
    [createProject, getProjectState],
  );

  const handleHome = useCallback(() => {
    setMode('home');
    setSelectedIds(new Set());
    setContextMenu(null);
    setSettingsOpen(false);
    setAssetsOpen(false);
    setModelMenu(null);
    setConnectingFrom(null);
    setDraftConnection(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const prefRaw = localStorage.getItem(PREF_KEY);
      if (prefRaw) {
        setPreferences({ ...defaultPreferences, ...JSON.parse(prefRaw) });
      }
      const projRaw = localStorage.getItem(PROJECTS_KEY);
      if (projRaw) {
        setProjects(JSON.parse(projRaw));
      }
      const assetsRaw = localStorage.getItem(ASSETS_KEY);
      if (assetsRaw) {
        setAssets(JSON.parse(assetsRaw));
      }
    } catch (error) {
        console.warn('Failed to load saved state', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PREF_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(ASSETS_KEY, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    if (!currentProject) return;
    const payload = JSON.stringify({ data, view });
    localStorage.setItem(storageKey, payload);
    setProjects((prev) => {
      const updated = prev.map((p) => (p.id === currentProject.id ? { ...p, updatedAt: new Date().toISOString() } : p));
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [currentProject, data, storageKey, view]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isFormElement =
        target.closest('textarea') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('[contenteditable="true"]');
      if (isFormElement) return;
      if (e.key === ' ' && !spaceHeld.current) {
        spaceHeld.current = true;
        document.body.style.cursor = 'grab';
      }
      if (e.key.toLowerCase() === 't') {
        addBlock('TEXT');
      }
      if (e.key.toLowerCase() === 'i') {
        addBlock('IMAGE');
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') {
        e.preventDefault();
        runSelected();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const first = Array.from(selectedIds)[0];
        if (first) {
          deleteBlock(first);
        }
      }
      if (e.key === 'Escape') {
        setContextMenu(null);
        setSettingsOpen(false);
        setSelectedIds(new Set());
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceHeld.current = false;
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [addBlock, deleteBlock, runSelected, selectedIds]);

  useEffect(() => {
    const onUp = () => handleMouseUp();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  if (mode === 'home') {
    return (
      <HomeScreen
        projects={projects}
        onCreateBlank={() => createProject('Untitled Canvas', CLEAN_CANVAS)}
        onCreateDemo={() => createProject('Demo Canvas', DEMO_CANVAS)}
        onOpen={openProject}
        onRename={renameProject}
        onDelete={deleteProject}
        onDuplicate={duplicateProject}
      />
    );
  }

  return (
    <div
      className="relative w-full h-screen overflow-hidden bg-[#050607] text-white font-sans select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      <div id="canvas-bg" className="absolute inset-0 w-full h-full">
        {preferences.showGrid && <GridBackground zoom={view.zoom} offset={view} />}
      </div>

      <div
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 w-full h-full"
      >
        <ConnectionLayer
          connections={data.connections}
          blocks={data.blocks}
          zoom={view.zoom}
          animate={preferences.animateConnections}
          draft={draftConnection}
        />

        <div className="pointer-events-auto">
          {data.blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              isSelected={selectedIds.has(block.id)}
              preferences={preferences}
              onMouseDown={startBlockDrag}
              onRun={runBlock}
              onDelete={deleteBlock}
              onEditText={onEditText}
              onRename={onRename}
              onStartConnection={(id) => setConnectingFrom(id)}
              onCompleteConnection={(id) => {
                if (connectingFrom && connectingFrom !== id) {
                  addConnection(connectingFrom, id);
                  setConnectingFrom(null);
                  setDraftConnection(null);
                } else if (connectingFrom === null) {
                  setConnectingFrom(id);
                }
              }}
              connectingFrom={connectingFrom}
              modelMenuOpen={modelMenu === block.id}
              onToggleModelMenu={(id) => setModelMenu((prev) => (prev === id ? null : id))}
              onSelectModel={setBlockModel}
              availableModels={block.type === 'TEXT' ? TEXT_MODELS : IMAGE_MODELS}
              onEditInstructions={(id, current) => setInstructionsModal({ id, value: current })}
            />
          ))}
        </div>
      </div>

      <TopBar
        onFit={fitToContent}
        onToggleGrid={() => setPreferences((p) => ({ ...p, showGrid: !p.showGrid }))}
        showGrid={preferences.showGrid}
        onResetView={resetView}
        onRunSelected={runSelected}
        onShare={onShare}
        onHome={handleHome}
        projectName={currentProject?.name ?? 'Canvas'}
      />
      <Sidebar
        onNavigateAssets={() => {
          if (!currentProject) {
            showToast('Open a canvas first');
            return;
          }
          setMode('canvas');
          setAssetsOpen(true);
        }}
        onAdd={(type) => addBlock(type)}
        onOpenSettings={() => setSettingsOpen(true)}
        mode={mode}
      />

      {instructionsModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={() => setInstructionsModal(null)}>
          <div
            className="w-[480px] bg-[#0f1116] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white text-lg font-semibold">Custom instructions</h3>
              <button className="text-[#7b7f8d] hover:text-white" onClick={() => setInstructionsModal(null)}>
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-[#b2b5c3]">
              These guidelines act like a system prompt for this node only. They’ll be prepended to the node’s prompt before execution.
            </p>
            <textarea
              className="w-full h-40 bg-[#0b0d12] border border-white/10 rounded-xl text-sm text-white p-3 font-mono resize-none focus:outline-none focus:border-white/20"
              value={instructionsModal.value}
              onChange={(e) => setInstructionsModal((m) => (m ? { ...m, value: e.target.value } : m))}
              spellCheck={false}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm rounded-lg border border-white/10 text-[#b2b5c3] hover:bg-white/5"
                onClick={() => setInstructionsModal(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm rounded-lg bg-[#3fa6ff] text-black font-semibold hover:brightness-110"
                onClick={() => {
                  if (instructionsModal) onEditInstructions(instructionsModal.id, instructionsModal.value);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu(null)}
        onAdd={(type, role) => {
          const world = screenToWorld(contextMenu.x, contextMenu.y);
          addBlock(type, world, role ?? 'standard');
        }}
      />
    )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} preferences={preferences} onUpdate={setPreferences} />

      {preferences.showHints && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-[#505460] text-[10px] font-mono pointer-events-none bg-[#0a0c10]/80 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-md">
          SPACE + DRAG to Pan  |  SCROLL to Zoom  |  RIGHT CLICK to Add  |  CTRL/CMD + ENTER to Run
        </div>
      )}

      {toast && <Toast message={toast} />}
      <AssetsPanel
        open={assetsOpen}
        onClose={() => setAssetsOpen(false)}
        assets={assets}
        onUploadFile={addAssetFromFile}
        onAddUrl={addAssetFromUrl}
        onApply={applyAssetToSelection}
        canApply={selectedIds.size > 0}
      />
    </div>
  );
}

