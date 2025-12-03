import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Home, Layers, Box, Settings, Maximize, Grid, RotateCcw, Share2, Save, Undo2, Redo2 
} from 'lucide-react';
import { Block, BlockType, Connection, Project, ViewState, ProjectMetadata } from './types';
import { THEME } from './constants';
import { BlockNode } from './components/BlockNode';
import { ConnectionLine } from './components/ConnectionLine';
import { ContextMenu } from './components/ContextMenu';
import { ProjectList } from './components/ProjectList';
import { AssetsPanel } from './components/AssetsPanel';
import { executeBlock, getDownstreamBlockIds } from './services/executionEngine';
import { storageService } from './services/storageService';

// --- Reusable UI Atoms ---
const IconButton = ({ icon: Icon, active, onClick, disabled, className = '' }: any) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${
      active 
        ? 'bg-white/10 text-white' 
        : disabled ? 'text-[#333] cursor-not-allowed' : 'text-[#7b7f8d] hover:text-white hover:bg-white/5'
    } ${className}`}
  >
    <Icon size={18} />
  </button>
);

const GridBackground = ({ zoom, offset }: { zoom: number, offset: { x: number, y: number } }) => (
  <div 
    className="absolute inset-0 pointer-events-none"
    style={{
      backgroundImage: `radial-gradient(${THEME.colors.grid} 1.5px, transparent 0)`,
      backgroundSize: `${16 * zoom}px ${16 * zoom}px`,
      backgroundPosition: `${offset.x}px ${offset.y}px`,
      opacity: 0.8
    }}
  />
);

export default function NebulaCanvas() {
  // --- Global App State ---
  const [currentView, setCurrentView] = useState<'HOME' | 'CANVAS'>('HOME');
  const [projectList, setProjectList] = useState<ProjectMetadata[]>([]);
  const [showAssets, setShowAssets] = useState(false);

  // --- Canvas State ---
  const [project, setProject] = useState<Project | null>(null);
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 1 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [tempConnection, setTempConnection] = useState<{ startBlockId: string, startX: number, startY: number, mx: number, my: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);

  // --- Undo/Redo Stacks ---
  const historyRef = useRef<Project[]>([]);
  const historyPointerRef = useRef<number>(-1);

  // --- Refs ---
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const isDraggingBlock = useRef(false);
  const dragBlockStart = useRef({ x: 0, y: 0 });
  const isSpacePressed = useRef(false);
  const isMarqueeSelecting = useRef(false);
  const marqueeStart = useRef({ x: 0, y: 0 });

  // --- Initialization ---
  useEffect(() => {
    const list = storageService.getProjects();
    setProjectList(list);
  }, [currentView]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLTextAreaElement)) {
        isSpacePressed.current = true;
        document.body.style.cursor = 'grab';
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) redo();
        else undo();
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size > 0 && !(e.target instanceof HTMLTextAreaElement)) {
            handleDeleteSelection();
        }
      }

      // Shortcuts
      if (!(e.target instanceof HTMLTextAreaElement)) {
          if (e.key === 't') {
              // Add Text at center
              // handled via simple logic or could open menu
          }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false;
        document.body.style.cursor = 'default';
        isDraggingCanvas.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedIds, project]); // Depend on project for undo context

  // --- History Management ---
  const pushToHistory = useCallback((newProjectState: Project) => {
    // If we are in the middle of history, truncate future
    const currentPointer = historyPointerRef.current;
    if (currentPointer < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(0, currentPointer + 1);
    }
    
    // Limit history size
    if (historyRef.current.length > 20) {
        historyRef.current.shift();
    } else {
        historyPointerRef.current++;
    }
    
    // Deep copy to store snapshot
    historyRef.current.push(JSON.parse(JSON.stringify(newProjectState)));
    // Also auto-save to disk
    storageService.saveProject(newProjectState);
  }, []);

  const updateProject = (updater: (prev: Project) => Project, saveHistory = true) => {
    if (!project) return;
    const newProject = updater(project);
    newProject.lastEdited = Date.now();
    setProject(newProject);
    if (saveHistory) {
        pushToHistory(newProject);
    } else {
        // Just save to disk without history step (e.g. while dragging)
        storageService.saveProject(newProject); 
    }
  };

  const undo = () => {
    if (historyPointerRef.current > 0) {
        historyPointerRef.current--;
        const previousState = historyRef.current[historyPointerRef.current];
        setProject(JSON.parse(JSON.stringify(previousState)));
    }
  };

  const redo = () => {
    if (historyPointerRef.current < historyRef.current.length - 1) {
        historyPointerRef.current++;
        const nextState = historyRef.current[historyPointerRef.current];
        setProject(JSON.parse(JSON.stringify(nextState)));
    }
  };

  // --- Project Actions ---
  const handleOpenProject = (id: string) => {
    const loaded = storageService.loadProject(id);
    if (loaded) {
        setProject(loaded);
        // Reset history
        historyRef.current = [JSON.parse(JSON.stringify(loaded))];
        historyPointerRef.current = 0;
        setCurrentView('CANVAS');
        // Reset view
        setView({ x: window.innerWidth / 2 - 400, y: 100, zoom: 1 });
    }
  };

  const handleCreateProject = () => {
    const newProj = storageService.createProject();
    setProject(newProj);
    historyRef.current = [JSON.parse(JSON.stringify(newProj))];
    historyPointerRef.current = 0;
    setCurrentView('CANVAS');
    setView({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 });
  };

  const handleDeleteProject = (id: string) => {
    storageService.deleteProject(id);
    setProjectList(prev => prev.filter(p => p.id !== id));
  };

  // --- Block Execution ---
  const handleRunBlock = async (blockId: string) => {
    if (!project) return;

    // 1. Set status to running
    updateProject(p => ({
        ...p,
        blocks: p.blocks.map(b => b.id === blockId ? { ...b, status: 'running', errorMessage: undefined } : b)
    }), false);

    // 2. Execute
    try {
        const block = project.blocks.find(b => b.id === blockId);
        if (!block) return;

        const result = await executeBlock(block, project);
        
        // 3. Update result
        updateProject(p => {
            const downstreamIds = getDownstreamBlockIds(blockId, p.connections);
            return {
                ...p,
                blocks: p.blocks.map(b => {
                    if (b.id === blockId) {
                        return { 
                            ...b, 
                            status: 'success', 
                            isStale: false,
                            content: { ...b.content, ...result }
                        };
                    }
                    if (downstreamIds.includes(b.id)) {
                        return { ...b, isStale: true };
                    }
                    return b;
                })
            };
        });
    } catch (e: any) {
        updateProject(p => ({
            ...p,
            blocks: p.blocks.map(b => b.id === blockId ? { ...b, status: 'error', errorMessage: e.message } : b)
        }));
    }
  };

  // --- Canvas Interactions ---
  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - view.x) / view.zoom,
    y: (sy - view.y) / view.zoom
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    // 1. Middle Click or Space -> Pan
    if (e.button === 1 || isSpacePressed.current) {
        isDraggingCanvas.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        return;
    }

    const target = e.target as HTMLElement;
    
    // 2. Port Click -> Start Connection
    const portType = target.dataset.portType;
    const blockId = target.dataset.blockId;
    
    if (portType === 'output' && blockId) {
        const rect = target.getBoundingClientRect();
        // Center of the port in screen space
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        
        // Convert start to world space for rendering the line correctly relative to canvas?
        // Actually the ConnectionLine renderer takes world coords.
        // We need to store the start Block ID.
        setTempConnection({
            startBlockId: blockId,
            startX: startX, // Screen space for initial click, but we need world for line?
                            // Let's rely on the block position for the start point in render.
            startY: startY, 
            mx: e.clientX,
            my: e.clientY
        });
        return;
    }

    // 3. Block Click -> Handled in BlockNode component props usually, 
    // but bubbling here if not stopped. 
    // If we click the background:
    if (target.id === 'canvas-bg') {
        setSelectedIds(new Set());
        setContextMenu(null);
        // Start Marquee
        isMarqueeSelecting.current = true;
        marqueeStart.current = { x: e.clientX, y: e.clientY };
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        setMarquee({ x1: x, y1: y, x2: x, y2: y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Pan
    if (isDraggingCanvas.current) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
        dragStart.current = { x: e.clientX, y: e.clientY };
        return;
    }

    // Block Drag (handled via simple state update for now, ideally requestAnimationFrame)
    if (selectedIds.size > 0 && e.buttons === 1 && !isSpacePressed.current && !tempConnection && !isMarqueeSelecting.current) {
        // We only support dragging one or all selected. Simple implementation: drag all selected
        const dx = (e.movementX) / view.zoom;
        const dy = (e.movementY) / view.zoom;
        
        setProject(prev => {
           if (!prev) return null;
           return {
               ...prev,
               blocks: prev.blocks.map(b => selectedIds.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b)
           };
        });
        // Note: We don't push to history on every mouse move, only on mouse up
    }

    // Connection Drag
    if (tempConnection) {
        setTempConnection(prev => prev ? { ...prev, mx: e.clientX, my: e.clientY } : null);
    }

    // Marquee Drag
    if (isMarqueeSelecting.current) {
        const currentWorld = screenToWorld(e.clientX, e.clientY);
        setMarquee(prev => prev ? { ...prev, x2: currentWorld.x, y2: currentWorld.y } : null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // End Pan
    isDraggingCanvas.current = false;

    // End Block Drag (Commit History)
    if (selectedIds.size > 0 && !isSpacePressed.current && !tempConnection && !isMarqueeSelecting.current) {
         if (project) pushToHistory(project);
    }

    // End Connection
    if (tempConnection) {
        const portType = target.dataset.portType;
        const endBlockId = target.dataset.blockId;

        if (portType === 'input' && endBlockId && endBlockId !== tempConnection.startBlockId) {
            // Create Connection
            // Check if exists
            const exists = project?.connections.some(c => c.from === tempConnection.startBlockId && c.to === endBlockId);
            if (!exists) {
                updateProject(p => ({
                    ...p,
                    connections: [...p.connections, { 
                        id: `c-${Date.now()}`, 
                        from: tempConnection.startBlockId, 
                        to: endBlockId 
                    }]
                }));
            }
        }
        setTempConnection(null);
    }

    // End Marquee
    if (isMarqueeSelecting.current && marquee && project) {
        // Calculate bounds
        const xMin = Math.min(marquee.x1, marquee.x2);
        const xMax = Math.max(marquee.x1, marquee.x2);
        const yMin = Math.min(marquee.y1, marquee.y2);
        const yMax = Math.max(marquee.y1, marquee.y2);

        const newSelection = new Set<string>();
        project.blocks.forEach(b => {
            // Simple center point check or overlapping rect check
            // Overlapping check:
            const bRight = b.x + b.width;
            const bBottom = b.y + 100; // approx height
            if (b.x < xMax && bRight > xMin && b.y < yMax && bBottom > yMin) {
                newSelection.add(b.id);
            }
        });
        setSelectedIds(newSelection);
        setMarquee(null);
        isMarqueeSelecting.current = false;
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      const s = 0.001 * -e.deltaY;
      const newZoom = Math.min(Math.max(0.1, view.zoom + s), 3);
      
      // Zoom towards mouse pointer logic could go here
      setView(v => ({ ...v, zoom: newZoom }));
    } else {
      // Pan
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  // --- Block Operations ---
  const handleAddBlock = (type: BlockType) => {
    if (!contextMenu || !project) return;
    const { x, y } = screenToWorld(contextMenu.x, contextMenu.y);
    
    const newBlock: Block = {
      id: `b-${Date.now()}`,
      type,
      title: type === 'TEXT' ? 'Text Gen' : 'Image Gen',
      modelId: type === 'TEXT' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-image',
      x,
      y,
      width: type === 'TEXT' ? 280 : 300,
      content: type === 'TEXT' ? { promptTemplate: '' } : { imagePrompt: '' },
      status: 'idle',
      isStale: true
    };

    updateProject(p => ({
        ...p,
        blocks: [...p.blocks, newBlock]
    }));
    setContextMenu(null);
  };

  const handleDeleteSelection = () => {
    updateProject(p => ({
        ...p,
        blocks: p.blocks.filter(b => !selectedIds.has(b.id)),
        connections: p.connections.filter(c => !selectedIds.has(c.from) && !selectedIds.has(c.to))
    }));
    setSelectedIds(new Set());
  };

  const handleUpdateBlockContent = (id: string, content: Partial<Block['content']>) => {
    setProject(prev => {
        if (!prev) return null;
        return {
            ...prev,
            blocks: prev.blocks.map(b => b.id === id ? { ...b, content: { ...b.content, ...content }, isStale: true } : b)
        };
    });
    // Debounce save logic could be added here
  };

  const handleUpdateModel = (id: string, modelId: string) => {
    updateProject(p => ({
        ...p,
        blocks: p.blocks.map(b => b.id === id ? { ...b, modelId, isStale: true } : b)
    }));
  };

  // --- Render ---
  if (currentView === 'HOME') {
    return (
        <ProjectList 
            projects={projectList} 
            onCreate={handleCreateProject}
            onOpen={handleOpenProject}
            onDelete={handleDeleteProject}
        />
    );
  }

  if (!project) return null;

  return (
    <div 
      className="w-full h-screen overflow-hidden bg-[#050607] text-white font-sans select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
    >
        {/* Background Layer */}
        <div id="canvas-bg" className="absolute inset-0 w-full h-full">
            <GridBackground zoom={view.zoom} offset={view} />
        </div>

        {/* World Space */}
        <div 
            style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                transformOrigin: '0 0',
            }}
            className="absolute inset-0 w-full h-full pointer-events-none"
        >
            <ConnectionLine connections={project.connections} blocks={project.blocks} view={view} />
            
            {/* Temp Connection Line */}
            {tempConnection && (
                <svg className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none z-50">
                    <path 
                        d={`M ${(tempConnection.startX - view.x)/view.zoom} ${(tempConnection.startY - view.y)/view.zoom} L ${(tempConnection.mx - view.x)/view.zoom} ${(tempConnection.my - view.y)/view.zoom}`} 
                        stroke={THEME.colors.accent} 
                        strokeWidth={2} 
                        strokeDasharray="5,5"
                        fill="none"
                    />
                </svg>
            )}

            {/* Marquee */}
            {marquee && (
                 <div 
                    className="absolute border border-[#3fa6ff] bg-[#3fa6ff]/10 z-50"
                    style={{
                        left: Math.min(marquee.x1, marquee.x2),
                        top: Math.min(marquee.y1, marquee.y2),
                        width: Math.abs(marquee.x2 - marquee.x1),
                        height: Math.abs(marquee.y2 - marquee.y1),
                    }}
                 />
            )}

            <div className="pointer-events-auto">
            {project.blocks.map(block => (
                <BlockNode 
                    key={block.id}
                    block={block}
                    isSelected={selectedIds.has(block.id)}
                    zoom={view.zoom}
                    onMouseDown={(e, id) => {
                        e.stopPropagation();
                        // Shift+Click for multi select
                        if (e.shiftKey) {
                            setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                            });
                        } else if (!selectedIds.has(id)) {
                            setSelectedIds(new Set([id]));
                        }
                    }}
                    onRun={handleRunBlock}
                    onDelete={(id) => {
                        updateProject(p => ({
                            ...p,
                            blocks: p.blocks.filter(b => b.id !== id),
                            connections: p.connections.filter(c => c.from !== id && c.to !== id)
                        }));
                    }}
                    onUpdateContent={handleUpdateBlockContent}
                    onUpdateModel={handleUpdateModel}
                />
            ))}
            </div>
        </div>

        {/* UI Overlays */}
        
        {/* Top Bar */}
        <div className="fixed top-0 left-0 w-full h-14 z-40 flex items-center justify-between px-6 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-b from-[#050607] to-transparent opacity-90" />
            
            <div className="pointer-events-auto relative z-10 flex items-center gap-4">
                <button onClick={() => setCurrentView('HOME')} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <Home size={18} className="text-[#b2b5c3]" />
                </button>
                <div className="h-6 w-[1px] bg-white/10" />
                <h1 className="text-sm font-medium text-[#f8f8fb]">{project.name}</h1>
            </div>

            <div className="pointer-events-auto relative z-10 flex items-center gap-2 bg-[#111318]/80 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-xl">
                <IconButton icon={Undo2} onClick={undo} disabled={historyPointerRef.current <= 0} />
                <IconButton icon={Redo2} onClick={redo} disabled={historyPointerRef.current >= historyRef.current.length - 1} />
                <div className="w-[1px] h-4 bg-white/10 mx-1" />
                <IconButton icon={RotateCcw} onClick={() => setView({ x: window.innerWidth/2 - 400, y: 100, zoom: 1 })} />
            </div>

            <div className="pointer-events-auto relative z-10 flex items-center gap-3">
                 <button 
                    onClick={() => updateProject(p => p)} // Force save
                    className="flex items-center gap-2 text-xs font-medium text-[#7b7f8d] hover:text-white transition-colors"
                 >
                    <Save size={14} /> 
                    Saved
                 </button>
            </div>
        </div>

        {/* Left Toolbar */}
        <div className="fixed left-6 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-4 pointer-events-none">
            <div className="pointer-events-auto bg-[#0a0c10]/90 backdrop-blur-xl border border-white/10 rounded-full py-3 px-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)] flex flex-col gap-2 w-14 items-center">
                <IconButton icon={Layers} active={!showAssets} onClick={() => setShowAssets(false)} />
                <IconButton icon={Box} active={showAssets} onClick={() => setShowAssets(!showAssets)} />
                <div className="w-6 h-[1px] bg-white/10 my-1" />
                <IconButton icon={Settings} />
            </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
            <ContextMenu 
                x={contextMenu.x} 
                y={contextMenu.y} 
                onClose={() => setContextMenu(null)}
                onAdd={handleAddBlock}
            />
        )}

        {/* Assets Panel */}
        {showAssets && (
            <AssetsPanel 
                blocks={project.blocks} 
                onClose={() => setShowAssets(false)} 
            />
        )}
    </div>
  );
}