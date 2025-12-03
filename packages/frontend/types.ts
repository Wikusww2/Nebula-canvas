export type BlockType = 'TEXT' | 'IMAGE';
export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export interface Position {
  x: number;
  y: number;
}

export interface BlockContent {
  text?: string;
  url?: string;
  caption?: string;
  // Configuration inputs
  systemPrompt?: string;
  promptTemplate?: string;
  imagePrompt?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  title: string;
  modelId: string;
  x: number;
  y: number;
  width: number;
  content: BlockContent;
  status: ExecutionStatus;
  isStale: boolean;
  errorMessage?: string;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
}

export interface Project {
  id: string;
  name: string;
  blocks: Block[];
  connections: Connection[];
  lastEdited: number; // Timestamp
  thumbnail?: string;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  lastEdited: number;
  blockCount: number;
}

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

export interface ModelConfig {
  id: string;
  type: BlockType;
  name: string;
  provider: 'gemini' | 'mock';
  description: string;
}
