import React from 'react';
import { Connection, Block, ViewState } from '../types';
import { THEME } from '../constants';

interface ConnectionLineProps {
  connections: Connection[];
  blocks: Block[];
  view: ViewState;
}

export const ConnectionLine: React.FC<ConnectionLineProps> = ({ connections, blocks, view }) => {
  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
      {connections.map(conn => {
        const from = blocks.find(b => b.id === conn.from);
        const to = blocks.find(b => b.id === conn.to);
        if (!from || !to) return null;

        // Calculate world positions
        // Output port: Right side of source
        const startX = view.x + (from.x + from.width) * view.zoom;
        const startY = view.y + (from.y + 60) * view.zoom;
        
        // Input port: Left side of target
        const endX = view.x + to.x * view.zoom;
        const endY = view.y + (to.y + 60) * view.zoom;

        const dist = Math.abs(endX - startX) * 0.5;
        const path = `M ${startX} ${startY} C ${startX + dist} ${startY}, ${endX - dist} ${endY}, ${endX} ${endY}`;

        const isRunning = from.status === 'running';

        return (
          <g key={conn.id}>
             {/* Shadow/Outline for visibility */}
             <path d={path} fill="none" stroke="#050607" strokeWidth={4 * view.zoom} strokeOpacity={0.5} />
             {/* Main Line */}
             <path 
                d={path} 
                fill="none" 
                stroke={isRunning ? THEME.colors.accent : THEME.colors.connection} 
                strokeWidth={2 * view.zoom} 
                className="transition-colors duration-300"
             />
             {/* Flow Animation */}
             {isRunning && (
               <circle r={3 * view.zoom} fill="#fff">
                 <animateMotion dur="1.5s" repeatCount="indefinite" path={path} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
               </circle>
             )}
          </g>
        );
      })}
    </svg>
  );
};
