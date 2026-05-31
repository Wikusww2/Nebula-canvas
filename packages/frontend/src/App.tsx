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
  Copy,
  Download,
  Upload,
  Wand2,
  Search,
  ArrowRight,
  FolderOpen,
  Sparkles,
  Clock3,
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
const OPENAI_API_KEY_STORAGE_KEY = 'nebula-openai-api-key-v1';
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
const DEFAULT_TEXT_MODEL_ID = TEXT_MODELS[0]?.id ?? 'gpt-5.5';
const DEFAULT_IMAGE_MODEL_ID = IMAGE_MODELS[0]?.id ?? 'gpt-image-2';

const demoImageUrl = (title: string, subtitle: string, accent: string) =>
  `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#06070a"/>
          <stop offset="0.52" stop-color="#111827"/>
          <stop offset="1" stop-color="#020617"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="38%" r="44%">
          <stop offset="0" stop-color="${accent}" stop-opacity="0.88"/>
          <stop offset="0.45" stop-color="${accent}" stop-opacity="0.28"/>
          <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="640" height="800" fill="url(#bg)"/>
      <circle cx="320" cy="305" r="245" fill="url(#glow)"/>
      <g fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round" opacity="0.9">
        <path d="M320 220 C250 120 138 170 196 280 C92 324 137 462 262 426 C273 553 445 553 456 426 C581 462 626 324 444 280 C502 170 390 120 320 220Z"/>
        <path d="M320 230 C292 305 292 390 320 462 C348 390 348 305 320 230Z"/>
        <path d="M210 286 C278 310 360 318 430 286"/>
        <path d="M255 427 C305 383 335 383 385 427"/>
      </g>
      <text x="320" y="650" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="700" text-anchor="middle">${title}</text>
      <text x="320" y="692" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="20" text-anchor="middle">${subtitle}</text>
    </svg>
  `)}`;

const DEMO_GLASS_FLOWER_URL = demoImageUrl('Glass Flower', 'Local demo reference', '#7dd3fc');
const DEMO_FLOWERS_BLOOMING_URL = demoImageUrl('Flowers Blooming', 'Local generated preview', '#fbbf24');
const normalizeModelId = (type: BlockType, modelId?: unknown) => {
  const models = type === 'TEXT' ? TEXT_MODELS : IMAGE_MODELS;
  const candidate = typeof modelId === 'string' ? modelId : '';
  return models.some((model) => model.id === candidate) ? candidate : type === 'TEXT' ? DEFAULT_TEXT_MODEL_ID : DEFAULT_IMAGE_MODEL_ID;
};

const normalizeImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.includes('photo-1695503460699-299f02275466')) return DEMO_GLASS_FLOWER_URL;
  if (url.includes('photo-1663486333792-628b75c88998')) return DEMO_FLOWERS_BLOOMING_URL;
  return url;
};

const DEFAULT_IMAGE_PROMPTS = new Set(['Ready to generate...', 'Drop a reference image here.']);

const blockLabel = (block: Block) => block.title || (block.type === 'TEXT' ? 'Text node' : 'Image node');

const textForFlow = (block: Block) => {
  const prompt = block.content.text?.trim();
  const generated = block.content.generated?.trim();
  if (prompt && generated && prompt !== generated) {
    return `${blockLabel(block)} prompt:\n${prompt}\n\n${blockLabel(block)} result:\n${generated}`;
  }
  return generated || prompt || '';
};

const imageForFlow = (block: Block) => {
  const caption = block.content.caption?.trim();
  const safeCaption = caption && !DEFAULT_IMAGE_PROMPTS.has(caption) ? caption : '';
  if (block.content.url?.startsWith('http')) {
    return [`${blockLabel(block)} image${safeCaption ? `: ${safeCaption}` : ''}`, block.content.url].filter(Boolean).join('\n');
  }
  return safeCaption ? `${blockLabel(block)} image: ${safeCaption}` : '';
};

const blockContextForFlow = (block: Block) => (block.type === 'TEXT' ? textForFlow(block) : imageForFlow(block));

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
        url: DEMO_GLASS_FLOWER_URL,
        caption: 'A radiant, translucent flower glows softly at its centre...',
      },
      status: 'idle',
      isStale: false,
      modelId: DEFAULT_IMAGE_MODEL_ID,
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
      modelId: DEFAULT_TEXT_MODEL_ID,
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
        url: DEMO_FLOWERS_BLOOMING_URL,
        caption: 'Variations generated based on the extracted palette.',
      },
      status: 'idle',
      isStale: false,
      modelId: DEFAULT_IMAGE_MODEL_ID,
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
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const DEMO_CANVAS = INITIAL_DATA;
const CLEAN_CANVAS: CanvasData = { blocks: [], connections: [] };
const MENU_WIDTH = 320;
const MENU_HEIGHT = 470;

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const cloneCanvasData = (canvas: CanvasData): CanvasData => ({
  blocks: canvas.blocks.map((block) => ({
    ...block,
    modelId: normalizeModelId(block.type, block.modelId),
    content: { ...block.content, url: block.type === 'IMAGE' ? normalizeImageUrl(block.content.url) : block.content.url },
  })),
  connections: canvas.connections.map((connection) => ({ ...connection })),
});

const safeSetLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to save ${key}`, error);
    return false;
  }
};

const getDownstreamBlockIds = (connections: Connection[], rootId: string) => {
  const visited = new Set<string>();
  const queue = connections.filter((connection) => connection.from === rootId).map((connection) => connection.to);

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    queue.push(...connections.filter((connection) => connection.from === current).map((connection) => connection.to));
  }

  return visited;
};

const wouldCreateCycle = (connections: Connection[], fromId: string, toId: string) =>
  getDownstreamBlockIds(connections, toId).has(fromId);

const normalizeImportedCanvas = (value: unknown): CanvasData | null => {
  const candidate = value as Partial<CanvasData>;
  if (!candidate || !Array.isArray(candidate.blocks) || !Array.isArray(candidate.connections)) return null;

  const blockIds = new Set<string>();
  const blocks = candidate.blocks
    .filter((block: any) => block && typeof block.id === 'string' && (block.type === 'TEXT' || block.type === 'IMAGE'))
    .map((block: any) => {
      blockIds.add(block.id);
      return {
        id: block.id,
        type: block.type,
        title: typeof block.title === 'string' ? block.title : block.type === 'TEXT' ? 'Imported Prompt' : 'Imported Image',
        role: block.role === 'input' || block.role === 'output' ? block.role : 'standard',
        systemPrompt: typeof block.systemPrompt === 'string' ? block.systemPrompt : '',
        x: Number.isFinite(block.x) ? block.x : 0,
        y: Number.isFinite(block.y) ? block.y : 0,
        width: Number.isFinite(block.width) ? block.width : 320,
        content:
          block.content && typeof block.content === 'object'
            ? { ...block.content, url: block.type === 'IMAGE' ? normalizeImageUrl(block.content.url) : block.content.url }
            : block.type === 'TEXT'
              ? { text: '' }
              : { url: '', caption: '' },
        status: 'idle' as BlockStatus,
        isStale: Boolean(block.isStale),
        modelId: normalizeModelId(block.type, block.modelId),
      };
    });

  const connections = candidate.connections
    .filter((connection: any) => connection && blockIds.has(connection.from) && blockIds.has(connection.to) && connection.from !== connection.to)
    .map((connection: any) => ({
      id: typeof connection.id === 'string' ? connection.id : createId('c'),
      from: connection.from,
      to: connection.to,
    }));

  return { blocks, connections };
};

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
  onEditCaption: (id: string, value: string) => void;
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
  onEditCaption,
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
      ? 'bg-[#7dd3fc]/15 text-[#bae6fd] border-[#7dd3fc]/30'
      : block.role === 'input'
        ? 'bg-[#99f6e4]/10 text-[#ccfbf1] border-[#99f6e4]/25'
        : 'bg-white/[0.04] text-[#8f98a8] border-white/[0.06]';
  const roleLabel = block.role === 'output' ? 'Output' : block.role === 'input' ? 'Input' : '';
  const roleFrame =
    block.role === 'output'
      ? 'bg-[linear-gradient(180deg,rgba(12,25,39,0.96),rgba(9,14,23,0.98))] border-[#7dd3fc]/30 ring-1 ring-[#7dd3fc]/20'
      : block.role === 'input'
        ? 'bg-[linear-gradient(180deg,rgba(12,22,20,0.95),rgba(9,13,16,0.98))] border-[#99f6e4]/20'
        : 'bg-[linear-gradient(180deg,rgba(17,20,27,0.96),rgba(10,13,18,0.98))] border-white/[0.08]';

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
            ? 'opacity-100 shadow-[0_24px_80px_rgba(5,12,18,0.72)] border border-[rgba(125,211,252,0.56)]'
            : 'opacity-0 border border-transparent'
        }`}
      />
      {block.role === 'output' && block.status === 'running' && (
        <div className="absolute -inset-[4px] rounded-[26px] pointer-events-none node-pulse-ring" />
      )}
      <div
        className={`relative flex flex-col overflow-hidden rounded-[22px]
        border shadow-[0_22px_70px_rgba(2,6,12,0.62),inset_0_1px_0_rgba(255,255,255,0.06)]
        transition-colors duration-200 ${isSelected ? 'border-[#7dd3fc]/45' : 'hover:border-white/15'} overflow-visible ${roleFrame}`}
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
          {isInput ? (
            <div className="text-[10px] uppercase font-medium tracking-wider text-[#8f98a8] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
              Source
            </div>
          ) : (
            <div className="relative">
              <button
                className="text-[10px] uppercase font-medium tracking-wider text-[#8f98a8] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] hover:border-[#7dd3fc]/35 hover:text-white"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleModelMenu(block.id);
                }}
              >
                {modelLabel}
              </button>
              {modelMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-52 max-h-64 overflow-y-auto bg-[#0b0e13] border border-white/10 rounded-xl shadow-2xl z-20"
                  onMouseDown={(e) => e.stopPropagation()}
                  onWheel={(e) => e.stopPropagation()}
                >
                  {availableModels.map((model) => (
                    <button
                      key={model.id}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectModel(block.id, model.id);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition ${
                        model.id === block.modelId ? 'bg-[#7dd3fc]/12 text-white' : 'text-[#b2b5c3] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="font-medium text-white">{model.displayName}</div>
                      <div className="text-[11px] text-[#7b7f8d]">{model.id}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
              {isInput ? (
                <div className="rounded-[16px] border border-[#99f6e4]/15 bg-[#07120f]/70 p-4 min-h-[132px]">
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-[#99f6e4]">Input source</div>
                  <textarea
                    className="w-full min-h-[98px] bg-transparent border-none resize-none text-[13px] font-mono text-[#dce7f5] leading-relaxed focus:outline-none"
                    value={block.content.text === 'Enter prompt...' ? '' : block.content.text || ''}
                    placeholder="Type the source context..."
                    onChange={(e) => onEditText(block.id, e.target.value)}
                    spellCheck={false}
                    onMouseDown={(ev) => ev.stopPropagation()}
                  />
                </div>
              ) : isOutput ? (
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
                <div className="bg-white/[0.025] rounded-[16px] p-4 min-h-[132px] border border-white/[0.06] hover:bg-white/[0.045] transition-colors group/text space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] uppercase tracking-wide text-[#7b7f8d]">Prompt</div>
                      {block.content.generated && (
                        <span className="text-[10px] text-[#7dd3fc]">Routed</span>
                      )}
                    </div>
                    <textarea
                      className="w-full min-h-[96px] bg-transparent border-none resize-none text-[13px] font-mono text-[#b2b5c3] leading-relaxed focus:outline-none"
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
              isOutput ? (
                <p className="text-[12px] text-[#7b7f8d] leading-tight pr-3 overflow-hidden text-ellipsis">
                  {block.content.caption || 'Ready to generate...'}
                </p>
              ) : (
                <textarea
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[12px] leading-snug text-[#b2b5c3] focus:border-white/20 focus:outline-none"
                  value={block.content.caption || ''}
                  placeholder={isInput ? 'Describe this reference image...' : 'Describe the image to generate...'}
                  onChange={(e) => onEditCaption(block.id, e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  spellCheck={false}
                />
              )
            )}
            {!isInput && (
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
            )}
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

      {!isInput && (
        <div
          className="absolute top-[60px] -left-1.5 w-3 h-3 rounded-full bg-[#111318] border-2 border-[#7b7f8d] hover:border-[#7dd3fc] hover:scale-125 transition-transform cursor-crosshair z-10"
          onMouseDown={(e) => {
            e.stopPropagation();
            onCompleteConnection(block.id);
          }}
          title="Input"
        />
      )}
      <div
        className="absolute top-[60px] -right-1.5 w-3 h-3 rounded-full bg-[#111318] border-2 border-[#f5f5f7] hover:border-[#7dd3fc] hover:scale-125 transition-transform cursor-crosshair z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartConnection(block.id);
        }}
        style={{ boxShadow: isConnecting ? '0 0 0 4px rgba(125,211,252,0.25)' : 'none' }}
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
  openAiApiKey: string;
  onSaveOpenAiApiKey: (value: string) => void;
  onClearOpenAiApiKey: () => void;
}> = ({ open, onClose, preferences, onUpdate, openAiApiKey, onSaveOpenAiApiKey, onClearOpenAiApiKey }) => {
  const [draftKey, setDraftKey] = useState(openAiApiKey);

  useEffect(() => {
    if (open) setDraftKey(openAiApiKey);
  }, [open, openAiApiKey]);

  if (!open) return null;
  const hasSavedKey = Boolean(openAiApiKey);
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

        <div className="mb-4 rounded-xl border border-white/10 bg-[#0a0c10] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-[#f8f8fb]">OpenAI API key</div>
              <div className="text-[12px] text-[#7b7f8d]">
                Saved only in this browser and sent to the local backend when you run a block.
              </div>
            </div>
            <span className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${hasSavedKey ? 'bg-green-500/10 text-green-200 border-green-400/30' : 'bg-white/5 text-[#7b7f8d] border-white/10'}`}>
              {hasSavedKey ? 'Saved' : 'Empty'}
            </span>
          </div>
          <input
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
            className="mt-3 w-full bg-[#111318] border border-white/10 text-sm px-3 py-2 rounded-lg text-white focus:outline-none focus:border-[#3fa6ff]/60"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-white text-black text-sm font-medium hover:scale-[1.02] transition disabled:opacity-40 disabled:hover:scale-100"
              disabled={!draftKey.trim()}
              onClick={() => onSaveOpenAiApiKey(draftKey)}
            >
              Save key
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-[#111318] border border-white/10 text-sm text-white hover:bg-[#181b22] transition disabled:opacity-40"
              disabled={!hasSavedKey && !draftKey}
              onClick={() => {
                setDraftKey('');
                onClearOpenAiApiKey();
              }}
            >
              Clear
            </button>
          </div>
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
  onAutoLayout: () => void;
  onAddOutput: () => void;
  onToggleGrid: () => void;
  showGrid: boolean;
  onResetView: () => void;
  onRunSelected: () => void;
  onRunOutputs: () => void;
  onDuplicateSelected: () => void;
  onExport: () => void;
  onImport: () => void;
  onShare: () => void;
  onHome: () => void;
  projectName: string;
}> = ({ onFit, onAutoLayout, onAddOutput, onToggleGrid, showGrid, onResetView, onRunSelected, onRunOutputs, onDuplicateSelected, onExport, onImport, onShare, onHome, projectName }) => (
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
          Saved locally <div className="w-1 h-1 rounded-full bg-green-500" />
        </div>
      </div>
    </div>

    <div className="pointer-events-auto relative z-10 flex items-center gap-2 bg-[#111318]/80 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-xl">
      <IconButton icon={Play} title="Run selected block (Ctrl/Cmd + Enter)" onClick={onRunSelected} />
      <IconButton icon={Wand2} title="Run full flow" onClick={onRunOutputs} />
      <IconButton icon={Box} title="Add output from selected" onClick={onAddOutput} />
      <IconButton icon={Copy} title="Duplicate selected block (Ctrl/Cmd + D)" onClick={onDuplicateSelected} />
      <IconButton icon={Maximize} title="Fit to content" onClick={onFit} />
      <IconButton icon={Layers} title="Auto arrange flow" onClick={onAutoLayout} />
      <IconButton icon={Grid} title="Toggle grid" active={showGrid} onClick={onToggleGrid} />
      <div className="w-[1px] h-4 bg-white/10 mx-1" />
      <IconButton icon={RotateCcw} title="Reset view" onClick={onResetView} />
      <IconButton icon={Download} title="Export canvas" onClick={onExport} />
      <IconButton icon={Upload} title="Import canvas" onClick={onImport} />
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
      <div className="w-8 h-8 rounded-xl bg-[#101720] border border-[#7dd3fc]/20 text-[11px] font-semibold text-[#bae6fd] flex items-center justify-center">N</div>
    </div>
  </div>
);

const Sidebar: React.FC<{
  onNavigateAssets: () => void;
  onAdd: (type: BlockType, role?: Block['role']) => void;
  onOpenSettings: () => void;
  mode: 'home' | 'canvas';
}> = ({ onNavigateAssets, onAdd, onOpenSettings, mode }) => (
  <div className="fixed left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4 pointer-events-none">
    <div className="pointer-events-auto bg-[#0a0c10]/92 backdrop-blur-xl border border-white/10 rounded-[24px] py-3 px-2 shadow-[0_18px_54px_rgba(2,6,12,0.65),inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col gap-2 w-14 items-center">
      <IconButton icon={Cloud} title="Assets" active={mode === 'home'} onClick={onNavigateAssets} />
      <IconButton icon={Layers} active={mode === 'canvas'} title="Canvas" />
      <div className="w-6 h-[1px] bg-white/10 my-1" />
      <IconButton icon={Type} onClick={() => onAdd('TEXT', 'input')} title="Add text input" />
      <IconButton icon={Box} onClick={() => onAdd('TEXT')} title="Add prompt block (T)" />
      <IconButton icon={ImageIcon} onClick={() => onAdd('IMAGE')} title="Add image block (I)" />
      <IconButton icon={Type} onClick={() => onAdd('TEXT', 'output')} title="Add text output" />
      <IconButton icon={ImageIcon} onClick={() => onAdd('IMAGE', 'output')} title="Add image output" />
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
          <span className="text-[11px] text-[#7b7f8d]">OpenAI image generation</span>
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

  const latestProject = projects
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const latestLabel = latestProject ? new Date(latestProject.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'None';
  const resultLabel = query ? `${filtered.length} matched` : `${projects.length} saved`;

  return (
    <main className="relative min-h-[100dvh] overflow-y-auto bg-[#07090d] px-4 py-5 text-white sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(125,211,252,0.08),transparent_28%,rgba(15,23,42,0.42)_68%,transparent)]" />
      <div className="relative mx-auto flex w-full max-w-[1480px] flex-col gap-6">
        <nav className="flex items-center justify-between gap-4 rounded-[28px] border border-white/[0.08] bg-[#0a0d12]/70 px-4 py-3 shadow-[0_22px_80px_rgba(2,6,12,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#7dd3fc]/25 bg-[#0f1720] text-sm font-semibold text-[#bae6fd] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              N
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Nebula Canvas</div>
              <div className="text-xs text-[#8792a5]">{resultLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="hidden items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-medium text-[#d7deea] hover:border-[#7dd3fc]/30 hover:bg-white/[0.07] sm:flex"
              onClick={onCreateDemo}
            >
              <Sparkles size={16} />
              Sample
            </button>
            <button
              className="flex items-center gap-2 rounded-2xl bg-[#f8fafc] px-4 py-2 text-sm font-semibold text-[#081018] shadow-[0_12px_32px_rgba(125,211,252,0.16)] hover:bg-white"
              onClick={onCreateBlank}
            >
              <Plus size={16} />
              New canvas
            </button>
          </div>
        </nav>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <div className="rounded-[34px] border border-white/[0.08] bg-[#0b0f15]/78 p-6 shadow-[0_28px_100px_rgba(2,6,12,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl md:p-8">
            <div className="max-w-3xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#7dd3fc]">Workspace</p>
              <h1 className="text-balance text-5xl font-semibold leading-[0.95] tracking-tight text-white md:text-6xl">
                Build the chain, inspect the result.
              </h1>
              <p className="mt-5 max-w-[58ch] text-base leading-7 text-[#aab4c2]">
                A local canvas for linked text and image runs, saved on this machine.
              </p>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_96px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6f7a8c]" size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search canvases"
                  className="h-[52px] w-full rounded-2xl border border-white/[0.08] bg-[#070a0f]/80 py-3 pl-11 pr-4 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-[#687386] focus:border-[#7dd3fc]/45 focus:outline-none"
                />
              </label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'recent' | 'name')}
                className="h-[52px] rounded-2xl border border-white/[0.08] bg-[#070a0f]/80 px-4 py-3 text-sm font-medium text-white focus:border-[#7dd3fc]/45 focus:outline-none"
                title="Sort canvases"
              >
                <option value="recent">Recent</option>
                <option value="name">Name</option>
              </select>
              <button
                className="h-[52px] rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-medium text-[#d7deea] hover:bg-white/[0.07]"
                onClick={() => setQuery('')}
              >
                Clear
              </button>
            </div>

            <div className="mt-8 grid grid-cols-3 divide-x divide-white/[0.08] border-y border-white/[0.08] py-4">
              <div className="px-2 first:pl-0">
                <div className="font-mono text-2xl text-white">{projects.length}</div>
                <div className="mt-1 text-xs text-[#7d8797]">Canvases</div>
              </div>
              <div className="px-5">
                <div className="font-mono text-2xl text-white">{filtered.length}</div>
                <div className="mt-1 text-xs text-[#7d8797]">Visible</div>
              </div>
              <div className="px-5">
                <div className="font-mono text-2xl text-white">{latestLabel}</div>
                <div className="mt-1 text-xs text-[#7d8797]">Latest</div>
              </div>
            </div>
          </div>

          <aside className="relative min-h-[360px] overflow-hidden rounded-[34px] border border-white/[0.08] bg-[#0b0f15] p-5 shadow-[0_28px_100px_rgba(2,6,12,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[length:24px_24px]" />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-[#7d8797]">Preview</div>
                <div className="mt-1 text-lg font-semibold text-white">Default chain</div>
              </div>
              <div className="rounded-xl border border-[#7dd3fc]/20 bg-[#7dd3fc]/10 px-3 py-1 text-xs font-medium text-[#bae6fd]">OpenAI</div>
            </div>
            <div className="relative mt-8 h-[250px]">
              <div className="absolute left-2 top-5 w-[42%] rounded-[22px] border border-[#99f6e4]/20 bg-[#07120f]/88 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
                <div className="mb-3 flex items-center gap-2 text-xs text-[#99f6e4]">
                  <Type size={14} />
                  Input
                </div>
                <div className="h-2.5 w-3/4 rounded-full bg-white/15" />
                <div className="mt-2 h-2.5 w-1/2 rounded-full bg-white/10" />
              </div>
              <div className="absolute left-[38%] top-[88px] h-px w-[24%] bg-[#7dd3fc]/45" />
              <div className="absolute left-[44%] top-[58px] w-[38%] rounded-[22px] border border-white/[0.09] bg-[#10151d]/90 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.3)]">
                <div className="mb-3 flex items-center gap-2 text-xs text-[#d7deea]">
                  <Box size={14} />
                  Prompt
                </div>
                <div className="h-2.5 w-5/6 rounded-full bg-white/15" />
                <div className="mt-2 h-2.5 w-2/3 rounded-full bg-white/10" />
              </div>
              <div className="absolute left-[63%] top-[171px] h-px w-[20%] bg-[#7dd3fc]/45" />
              <div className="absolute bottom-0 right-1 w-[42%] rounded-[22px] border border-[#7dd3fc]/24 bg-[#081521]/92 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.34)]">
                <div className="mb-3 flex items-center gap-2 text-xs text-[#bae6fd]">
                  <ImageIcon size={14} />
                  Output
                </div>
                <div className="aspect-[16/9] rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,#0f172a,#132235)]" />
              </div>
            </div>
          </aside>
        </section>

        <section className="pb-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Recent canvases</h2>
              <p className="mt-1 text-sm text-[#8b96a8]">{query ? 'Filtered results' : 'Saved locally'}</p>
            </div>
            <button
              className="hidden items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-medium text-[#d7deea] hover:bg-white/[0.07] sm:flex"
              onClick={onCreateBlank}
            >
              <Plus size={16} />
              Blank canvas
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-white/[0.12] bg-[#0a0d12]/72 p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <FolderOpen className="mx-auto text-[#7dd3fc]" size={36} />
              <h3 className="mt-4 text-xl font-semibold text-white">No canvases found</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8b96a8]">
                Create a blank canvas or load the sample template.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-[#081018]" onClick={onCreateBlank}>
                  New canvas
                </button>
                <button className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-white" onClick={onCreateDemo}>
                  Sample
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((project, index) => (
                <article
                  key={project.id}
                  className="group relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0b0f15]/82 p-4 shadow-[0_18px_58px_rgba(2,6,12,0.42),inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-300 hover:-translate-y-1 hover:border-[#7dd3fc]/28 hover:bg-[#0e131b]"
                  style={{ animationDelay: `${index * 55}ms` }}
                >
                  <div className="relative mb-4 h-36 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#070a0f]">
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:18px_18px]" />
                    <div className="absolute left-4 top-5 h-12 w-28 rounded-2xl border border-[#99f6e4]/20 bg-[#0b1a16]" />
                    <div className="absolute left-[132px] top-[48px] h-px w-16 bg-[#7dd3fc]/38" />
                    <div className="absolute right-5 top-12 h-14 w-32 rounded-2xl border border-[#7dd3fc]/20 bg-[#0d1824]" />
                    <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between text-[10px] text-[#6f7a8c]">
                      <span>local</span>
                      <span className="font-mono">{new Date(project.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-white">{project.name}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[#8b96a8]">
                        <Clock3 size={13} />
                        {new Date(project.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      className="shrink-0 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-[#081018] hover:bg-[#eaf6fb]"
                      onClick={() => onOpen(project)}
                    >
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs text-[#d7deea] hover:bg-white/[0.07]" onClick={() => onRename(project)}>
                      Rename
                    </button>
                    <button className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs text-[#d7deea] hover:bg-white/[0.07]" onClick={() => onDuplicate(project)}>
                      Duplicate
                    </button>
                    <button className="rounded-xl border border-red-400/25 bg-red-500/[0.06] px-3 py-2 text-xs text-red-100 hover:bg-red-500/[0.1]" onClick={() => onDelete(project)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

const AssetsPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  assets: AssetItem[];
  onUploadFile: (file: File) => void;
  onAddUrl: (url: string) => void;
  onApply: (asset: AssetItem) => void;
  onRemove: (assetId: string) => void;
  canApply: boolean;
}> = ({ open, onClose, assets, onUploadFile, onAddUrl, onApply, onRemove, canApply }) => {
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
                e.currentTarget.value = '';
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
              <div className="flex items-center gap-1">
                <a
                  href={asset.url}
                  download={asset.name || 'nebula-asset'}
                  className="px-2 py-2 rounded-lg bg-[#111318] border border-white/10 text-[#b2b5c3] hover:text-white hover:bg-[#181b22] transition"
                  title="Download asset"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Download size={14} />
                </a>
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
                <button
                  onClick={() => onRemove(asset.id)}
                  className="px-2 py-2 rounded-lg bg-[#1a0f0f] border border-red-400/30 text-red-200 hover:bg-[#220c0c] transition"
                  title="Remove asset"
                >
                  <Trash2 size={14} />
                </button>
              </div>
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
  const [openAiApiKey, setOpenAiApiKey] = useState('');
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
  const importInputRef = useRef<HTMLInputElement | null>(null);
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
        id: createId('b'),
        type,
        title: type === 'TEXT' ? 'New Prompt' : 'New Image',
        role,
        systemPrompt: '',
        x: snap(basePos.x),
        y: snap(basePos.y),
        width: 320,
        content: type === 'TEXT' ? { text: '' } : { url: '', caption: role === 'input' ? 'Drop a reference image here.' : 'Ready to generate...' },
        status: role === 'input' ? 'success' : 'idle',
        isStale: role !== 'input',
        modelId: type === 'TEXT' ? DEFAULT_TEXT_MODEL_ID : DEFAULT_IMAGE_MODEL_ID,
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

  const saveOpenAiApiKey = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        showToast('Enter an OpenAI API key first.');
        return;
      }
      setOpenAiApiKey(trimmed);
      safeSetLocalStorage(OPENAI_API_KEY_STORAGE_KEY, trimmed);
      showToast('OpenAI key saved locally.');
    },
    [showToast],
  );

  const clearOpenAiApiKey = useCallback(() => {
    setOpenAiApiKey('');
    try {
      localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear OpenAI key', error);
    }
    showToast('OpenAI key cleared.');
  }, [showToast]);

  const setBlockModel = useCallback(
    (blockId: string, modelId: string) => {
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          if (b.id === blockId) return { ...b, modelId, isStale: true, status: 'idle' };
          return getDownstreamBlockIds(prev.connections, blockId).has(b.id) ? { ...b, isStale: true, status: 'idle' } : b;
        }),
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
        blocks: prev.blocks.map((b) => (getDownstreamBlockIds(prev.connections, blockId).has(b.id) ? { ...b, isStale: true, status: 'idle' } : b)),
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
        if (block.role === 'input') {
          updateData((prev) => ({
            ...prev,
            blocks: prev.blocks.map((b) => (b.id === id ? { ...b, status: 'success', isStale: false } : b)),
          }));
          return;
        }

        const upstreamIds = current.connections.filter((c) => c.to === id).map((c) => c.from);
        for (const upstreamId of upstreamIds) {
          const upstream = current.blocks.find((b) => b.id === upstreamId);
          if (upstream && (upstream.role === 'output' || upstream.isStale || upstream.status !== 'success')) {
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
          const upstreamBlocks = upstreamIds
            .map((upId) => latest.blocks.find((b) => b.id === upId))
            .filter(Boolean) as Block[];
          const upstreamContext = upstreamBlocks.map(blockContextForFlow).filter(Boolean).join('\n\n---\n\n');
          const ownText = latestBlock.content.text?.trim() || '';
          const ownCaption = latestBlock.content.caption?.trim() || '';
          const ownImagePrompt = ownCaption && !DEFAULT_IMAGE_PROMPTS.has(ownCaption) ? ownCaption : '';

          const basePrompt =
            latestBlock.type === 'TEXT'
              ? [
                  upstreamContext ? `Upstream context:\n${upstreamContext}` : '',
                  ownText ? `Current node prompt:\n${ownText}` : '',
                ]
                  .filter(Boolean)
                  .join('\n\n')
              : [
                  upstreamContext ? `Use this upstream context as the image brief:\n${upstreamContext}` : '',
                  ownImagePrompt ? `Current image node prompt:\n${ownImagePrompt}` : '',
                ]
                  .filter(Boolean)
                  .join('\n\n')
                  .trim();

          const nodeSystemPrompt = [GLOBAL_SYSTEM_PROMPT, latestBlock.systemPrompt?.trim()].filter(Boolean).join('\n\n');
          const promptSegments = [nodeSystemPrompt, basePrompt].filter(Boolean);
          const promptBaseRaw = promptSegments.join('\n\n');
          // Truncate to protect model context limits
          const promptBase = promptBaseRaw.length > 6000 ? `${promptBaseRaw.slice(0, 6000)}\n...[truncated]` : promptBaseRaw;

          if (!basePrompt.trim() && latestBlock.role !== 'input') {
            throw new Error('Add a prompt or connect an upstream block before running this node.');
          }

          let result: BlockContent = {};
          if (latestBlock.type === 'TEXT') {
            if (latestBlock.role === 'output') {
              // Text output nodes are explicit pass-through sinks for the resolved upstream context.
              const finalText = upstreamContext || latestBlock.content.generated || latestBlock.content.text || 'Run upstream to see output.';
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
                  apiKey: openAiApiKey || undefined,
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
              body: JSON.stringify({ prompt: promptBase, modelId: latestBlock.modelId, systemPrompt: nodeSystemPrompt, apiKey: openAiApiKey || undefined }),
            });
            const raw = await resp.text();
            const data = raw ? (() => { try { return JSON.parse(raw); } catch { return { error: raw }; } })() : {};
            if (!resp.ok) throw new Error((data as any).error || raw || 'Image generation failed');
            const generatedCaption = ownImagePrompt || (upstreamContext ? upstreamContext.slice(0, 240) : 'Generated image');
            result = { url: (data as any).url, caption: generatedCaption };
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
          const message = String(error?.message || '');
          if (message.toLowerCase().includes('api key')) {
            showToast('Add an OpenAI API key in Settings to run AI generation.', 3500);
          } else if (message) {
            showToast(`Generation failed: ${message.slice(0, 120)}`, 4500);
          } else {
            showToast(`Generation failed. Check the backend at ${API_BASE}.`, 3500);
          }
          return;
        }

        const downstreamIds = dataRef.current.connections.filter((c) => c.from === id).map((c) => c.to);
        for (const downId of downstreamIds) {
          await runWithDeps(downId);
        }
      };

      await runWithDeps(blockId);
    },
    [openAiApiKey, showToast, updateData],
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

  const handleMouseUp = useCallback(() => {
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
  }, [preferences.snapToGrid, snap, updateData]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 12),
      y: Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 12),
    });
    setConnectingFrom(null);
    setDraftConnection(null);
  };

  const startBlockDrag = (e: React.MouseEvent<HTMLDivElement>, block: Block) => {
    // Don't drag when interacting with text inputs
    const target = e.target as HTMLElement;
    if (
      target.closest('textarea') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('button') ||
      target.closest('a') ||
      target.closest('[contenteditable="true"]')
    ) {
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
        blocks: prev.blocks.map((b) => {
          if (b.id !== id) return b;
          const { generated, ...contentWithoutGenerated } = b.content;
          return {
            ...b,
            content: { ...contentWithoutGenerated, text: value },
            isStale: b.role !== 'input',
            status: b.role === 'input' ? 'success' : 'idle',
          };
        }),
      }));
      markDownstreamStale(id);
    },
    [markDownstreamStale, updateData],
  );

  const onEditCaption = useCallback(
    (id: string, value: string) => {
      updateData((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          if (b.id !== id) return b;
          return {
            ...b,
            content: { ...b.content, caption: value },
            isStale: b.role !== 'input',
            status: b.role === 'input' ? 'success' : 'idle',
          };
        }),
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
        const fromBlock = prev.blocks.find((block) => block.id === fromId);
        const toBlock = prev.blocks.find((block) => block.id === toId);
        if (!fromBlock || !toBlock) return prev;
        if (toBlock.role === 'input') {
          showToast('Input nodes start a flow and cannot receive connections.');
          return prev;
        }
        const exists = prev.connections.some((c) => c.from === fromId && c.to === toId);
        if (exists) return prev;
        if (wouldCreateCycle(prev.connections, fromId, toId)) {
          showToast('That connection would create a loop.');
          return prev;
        }
        const downstream = getDownstreamBlockIds([...prev.connections, { id: 'draft', from: fromId, to: toId }], fromId);
        return {
          ...prev,
          connections: [...prev.connections, { id: createId('c'), from: fromId, to: toId }],
          blocks: prev.blocks.map((block) => (downstream.has(block.id) ? { ...block, isStale: true, status: 'idle' } : block)),
        };
      });
    },
    [showToast, updateData],
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
      if (!file.type.startsWith('image/')) {
        showToast('Upload an image file.');
        return;
      }
      if (file.size > 6 * 1024 * 1024) {
        showToast('Image is larger than 6 MB. Use a smaller asset.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = typeof reader.result === 'string' ? reader.result : '';
        const newAsset: AssetItem = {
          id: createId('a'),
          name: file.name,
          url,
          createdAt: new Date().toISOString(),
        };
        setAssets((prev) => [newAsset, ...prev].slice(0, 50));
        showToast('Asset added');
      };
      reader.onerror = () => showToast('Could not read that image file.');
      reader.readAsDataURL(file);
    },
    [showToast],
  );

  const addAssetFromUrl = useCallback(
    (url: string) => {
      if (!url) return;
      const isValidImageSource = url.startsWith('data:image/') || /^https?:\/\/\S+$/i.test(url);
      if (!isValidImageSource) {
        showToast('Use a valid image URL.');
        return;
      }
      const newAsset: AssetItem = {
        id: createId('a'),
        name: new URL(url, window.location.href).hostname || 'Image',
        url,
        createdAt: new Date().toISOString(),
      };
      setAssets((prev) => [newAsset, ...prev].slice(0, 50));
      showToast('Asset added from URL');
    },
    [showToast],
  );

  const removeAsset = useCallback(
    (assetId: string) => {
      setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
      showToast('Asset removed');
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
      const selectedBlock = dataRef.current.blocks.find((block) => block.id === selectedId);
      if (!selectedBlock || selectedBlock.type !== 'IMAGE') {
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
      markDownstreamStale(selectedId);
      showToast('Asset applied to block');
    },
    [markDownstreamStale, selectedIds, showToast, updateData],
  );

  const runSelected = useCallback(() => {
    const first = Array.from(selectedIds)[0];
    if (first) {
      runBlock(first);
    } else {
      showToast('Select a block to run');
    }
  }, [runBlock, selectedIds, showToast]);

  const runOutputBlocks = useCallback(async () => {
    const outgoingIds = new Set(dataRef.current.connections.map((connection) => connection.from));
    const targets = dataRef.current.blocks.filter((block) => block.role !== 'input' && !outgoingIds.has(block.id));
    if (!targets.length) {
      showToast('Add a connected flow or terminal block to run.');
      return;
    }
    for (const target of targets) {
      await runBlock(target.id);
    }
  }, [runBlock, showToast]);

  const duplicateSelectedBlock = useCallback(() => {
    const selectedId = Array.from(selectedIds)[0];
    const block = dataRef.current.blocks.find((candidate) => candidate.id === selectedId);
    if (!block) {
      showToast('Select a block to duplicate');
      return;
    }
    const duplicate: Block = {
      ...block,
      id: createId('b'),
      title: `${block.title} copy`,
      x: snap(block.x + 48),
      y: snap(block.y + 48),
      content: { ...block.content },
      status: block.role === 'input' ? block.status : 'idle',
      isStale: block.role !== 'input',
    };
    updateData((prev) => ({ ...prev, blocks: [...prev.blocks, duplicate] }));
    setSelectedIds(new Set([duplicate.id]));
    showToast('Block duplicated');
  }, [selectedIds, showToast, snap, updateData]);

  const addOutputFromSelected = useCallback(() => {
    const selectedId = Array.from(selectedIds)[0];
    const source = dataRef.current.blocks.find((candidate) => candidate.id === selectedId);
    if (!source) {
      showToast('Select a source block first');
      return;
    }
    if (source.role === 'output') {
      showToast('That block is already an output');
      return;
    }

    const outputType = source.type;
    const output: Block = {
      id: createId('b'),
      type: outputType,
      title: outputType === 'TEXT' ? 'Text Output' : 'Image Output',
      role: 'output',
      systemPrompt: '',
      x: snap(source.x + source.width + 180),
      y: snap(source.y),
      width: outputType === 'TEXT' ? 360 : 340,
      content: outputType === 'TEXT' ? { text: '' } : { url: '', caption: 'Ready to render from upstream.' },
      status: 'idle',
      isStale: true,
      modelId: outputType === 'TEXT' ? DEFAULT_TEXT_MODEL_ID : DEFAULT_IMAGE_MODEL_ID,
    };

    updateData((prev) => ({
      ...prev,
      blocks: [...prev.blocks, output],
      connections: [...prev.connections, { id: createId('c'), from: source.id, to: output.id }],
    }));
    setSelectedIds(new Set([output.id]));
    showToast('Output node added');
  }, [selectedIds, showToast, snap, updateData]);

  const autoArrangeFlow = useCallback(() => {
    const snapshot = dataRef.current;
    if (!snapshot.blocks.length) {
      showToast('Add blocks before arranging');
      return;
    }

    const depthById = new Map<string, number>(snapshot.blocks.map((block) => [block.id, 0]));
    for (let pass = 0; pass < snapshot.blocks.length; pass += 1) {
      let changed = false;
      for (const connection of snapshot.connections) {
        const nextDepth = (depthById.get(connection.from) ?? 0) + 1;
        if (nextDepth > (depthById.get(connection.to) ?? 0)) {
          depthById.set(connection.to, nextDepth);
          changed = true;
        }
      }
      if (!changed) break;
    }

    const lanes = new Map<number, Block[]>();
    snapshot.blocks.forEach((block) => {
      const depth = depthById.get(block.id) ?? 0;
      lanes.set(depth, [...(lanes.get(depth) ?? []), block]);
    });

    const nextPositions = new Map<string, { x: number; y: number }>();
    [...lanes.entries()].forEach(([depth, blocks]) => {
      blocks
        .sort((a, b) => a.y - b.y)
        .forEach((block, index) => {
          nextPositions.set(block.id, {
            x: snap(160 + depth * 460),
            y: snap(160 + index * 360),
          });
        });
    });

    updateData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) => ({ ...block, ...(nextPositions.get(block.id) ?? {}) })),
    }));
    setView({ x: 80, y: 48, zoom: 0.9 });
    showToast('Flow arranged');
  }, [showToast, snap, updateData]);

  const exportCanvas = useCallback(() => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: currentProject,
      data: dataRef.current,
      view,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (currentProject?.name || 'nebula-canvas').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'nebula-canvas';
    link.href = url;
    link.download = `${safeName}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Canvas exported');
  }, [currentProject, showToast, view]);

  const importCanvasFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const imported = normalizeImportedCanvas(parsed.data ?? parsed);
        if (!imported) {
          showToast('Could not import that canvas file.');
          return;
        }
        updateData(() => imported);
        dataRef.current = imported;
        if (parsed.view && Number.isFinite(parsed.view.x) && Number.isFinite(parsed.view.y) && Number.isFinite(parsed.view.zoom)) {
          setView(parsed.view);
        }
        setSelectedIds(new Set());
        showToast('Canvas imported');
      } catch (error) {
        console.error(error);
        showToast('Could not import that canvas file.');
      }
    },
    [showToast, updateData],
  );

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
      const nextData = cloneCanvasData(state.data);
      setData(nextData);
      dataRef.current = nextData;
      setView(state.view);
      setSelectedIds(new Set());
      setContextMenu(null);
      setAssetsOpen(false);
      setModelMenu(null);
    },
    [getProjectState],
  );

  const createProject = useCallback(
    (name: string, seed: CanvasData) => {
      const project: ProjectMeta = { id: createId('p'), name, updatedAt: new Date().toISOString() };
      const seededData = cloneCanvasData(seed);
      const nextProjects = [...projects, project];
      setProjects(nextProjects);
      safeSetLocalStorage(PROJECTS_KEY, JSON.stringify(nextProjects));
      setCurrentProject(project);
      setData(seededData);
      dataRef.current = seededData;
      setView(defaultView);
      setMode('canvas');
      setSelectedIds(new Set());
      safeSetLocalStorage(`${STORAGE_KEY}-${project.id}`, JSON.stringify({ data: seededData, view: defaultView }));
    },
    [projects],
  );

  const renameProject = useCallback(
    (project: ProjectMeta) => {
      const nextName = window.prompt('Rename canvas', project.name)?.trim();
      if (!nextName) return;
      const updated = projects.map((p) => (p.id === project.id ? { ...p, name: nextName, updatedAt: new Date().toISOString() } : p));
      setProjects(updated);
      safeSetLocalStorage(PROJECTS_KEY, JSON.stringify(updated));
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
      safeSetLocalStorage(PROJECTS_KEY, JSON.stringify(next));
      try {
        localStorage.removeItem(`${STORAGE_KEY}-${project.id}`);
      } catch (error) {
        console.warn('Failed to remove saved canvas', error);
      }
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
      const savedOpenAiKey = localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY);
      if (savedOpenAiKey) {
        setOpenAiApiKey(savedOpenAiKey);
      }
    } catch (error) {
        console.warn('Failed to load saved state', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    safeSetLocalStorage(PREF_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    safeSetLocalStorage(ASSETS_KEY, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    if (!currentProject) return;
    const payload = JSON.stringify({ data, view });
    const saved = safeSetLocalStorage(storageKey, payload);
    if (!saved) {
      showToast('Could not save locally. Remove large assets or export the canvas.');
      return;
    }
    setProjects((prev) => {
      const updated = prev.map((p) => (p.id === currentProject.id ? { ...p, updatedAt: new Date().toISOString() } : p));
      safeSetLocalStorage(PROJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [currentProject, data, showToast, storageKey, view]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isFormElement =
        target.closest('textarea') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('[contenteditable="true"]');
      if (isFormElement) return;
      if (mode !== 'canvas') return;
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelectedBlock();
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
  }, [addBlock, deleteBlock, duplicateSelectedBlock, mode, runSelected, selectedIds]);

  useEffect(() => {
    const onUp = () => handleMouseUp();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [handleMouseUp]);

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
      className="relative w-full h-[100dvh] overflow-hidden bg-[#07090d] text-white font-sans select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      <div id="canvas-bg" className="absolute inset-0 w-full h-full">
        {preferences.showGrid && <GridBackground zoom={view.zoom} offset={view} />}
      </div>

      {data.blocks.length === 0 && (
        <div className="fixed inset-0 z-10 flex items-center justify-center pointer-events-none px-6">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0c10]/90 p-5 shadow-[0_22px_65px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <div className="text-xs uppercase tracking-[0.18em] text-[#7b7f8d]">Empty canvas</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Start with a prompt or image block.</h2>
            <p className="mt-2 text-sm text-[#b2b5c3] leading-relaxed">
              Add blocks from the left rail, then drag from an output dot to another block’s input dot to build a flow.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.02]"
                onClick={() => addBlock('TEXT')}
              >
                <Plus size={16} className="mr-2 inline" />
                Text block
              </button>
              <button
                className="rounded-xl border border-white/10 bg-[#111318] px-4 py-2 text-sm text-white transition hover:bg-[#181b22]"
                onClick={() => addBlock('IMAGE')}
              >
                <ImageIcon size={16} className="mr-2 inline" />
                Image block
              </button>
            </div>
          </div>
        </div>
      )}

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
              onEditCaption={onEditCaption}
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
        onAutoLayout={autoArrangeFlow}
        onAddOutput={addOutputFromSelected}
        onToggleGrid={() => setPreferences((p) => ({ ...p, showGrid: !p.showGrid }))}
        showGrid={preferences.showGrid}
        onResetView={resetView}
        onRunSelected={runSelected}
        onRunOutputs={runOutputBlocks}
        onDuplicateSelected={duplicateSelectedBlock}
        onExport={exportCanvas}
        onImport={() => importInputRef.current?.click()}
        onShare={onShare}
        onHome={handleHome}
        projectName={currentProject?.name ?? 'Canvas'}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) importCanvasFile(file);
          event.target.value = '';
        }}
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
        onAdd={(type, role) => addBlock(type, undefined, role ?? 'standard')}
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

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        onUpdate={setPreferences}
        openAiApiKey={openAiApiKey}
        onSaveOpenAiApiKey={saveOpenAiApiKey}
        onClearOpenAiApiKey={clearOpenAiApiKey}
      />

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
        onRemove={removeAsset}
        canApply={selectedIds.size > 0}
      />
    </div>
  );
}
