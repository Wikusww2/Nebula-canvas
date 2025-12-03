import { Project, ModelConfig } from './types';

export const THEME = {
  colors: {
    bg: '#050607',
    grid: '#20232a',
    panel: '#111318',
    panelElevated: '#181b22',
    border: 'rgba(255,255,255,0.06)',
    borderHover: 'rgba(255,255,255,0.15)',
    borderSelected: 'rgba(117, 187, 255, 0.65)',
    textPrimary: '#f8f8fb',
    textSecondary: '#b2b5c3',
    textMuted: '#7b7f8d',
    accent: '#3fa6ff',
    connection: 'rgba(255,255,255,0.28)',
    connectionActive: 'rgba(117, 187, 255, 0.85)',
    glow: '0 0 20px rgba(117, 187, 255, 0.3)',
  },
};

export const AVAILABLE_MODELS: ModelConfig[] = [
  { id: 'gemini-2.5-flash', type: 'TEXT', name: 'Gemini 2.5 Flash', provider: 'gemini', description: 'Fast, efficient text generation' },
  { id: 'gemini-3-pro-preview', type: 'TEXT', name: 'Gemini 3 Pro', provider: 'gemini', description: 'Complex reasoning tasks' },
  { id: 'gemini-2.5-flash-image', type: 'IMAGE', name: 'Gemini Flash Image', provider: 'gemini', description: 'High speed image generation' },
  { id: 'mock-text', type: 'TEXT', name: 'Mock Text', provider: 'mock', description: 'Offline simulation' },
  { id: 'mock-image', type: 'IMAGE', name: 'Mock Image', provider: 'mock', description: 'Offline random images' },
];

export const DEMO_PROJECT: Project = {
  id: 'demo-glass-flower',
  name: 'Glass Flower Campaign',
  lastEdited: Date.now(),
  blocks: [
    {
      id: 'b1',
      type: 'IMAGE',
      title: 'Glass Flower Reference',
      modelId: 'gemini-2.5-flash-image',
      x: 150,
      y: 150,
      width: 300,
      content: {
        url: 'https://images.unsplash.com/photo-1695503460699-299f02275466?q=80&w=3132&auto=format&fit=crop',
        caption: 'A radiant, translucent flower glows softly at its centre...',
        imagePrompt: 'A radiant, translucent flower glows softly at its centre'
      },
      status: 'success',
      isStale: false
    },
    {
      id: 'b2',
      type: 'TEXT',
      title: 'Extract Palette',
      modelId: 'gemini-2.5-flash',
      x: 550,
      y: 200,
      width: 280,
      content: {
        text: '#FFAD5D (orange)\n#FFFFFF (white)\n#0C0D20 (black)',
        promptTemplate: 'Analyze the image and extract a 3-color hex palette: {{input1}}',
        systemPrompt: 'You are a design expert.'
      },
      status: 'success',
      isStale: false
    },
    {
      id: 'b3',
      type: 'IMAGE',
      title: 'Generated Variant',
      modelId: 'gemini-2.5-flash-image',
      x: 950,
      y: 180,
      width: 300,
      content: {
        url: 'https://images.unsplash.com/photo-1663486333792-628b75c88998?q=80&w=2160&auto=format&fit=crop',
        caption: 'Variations generated based on the extracted palette.',
        imagePrompt: 'A field of flowers using this palette: {{input1}}'
      },
      status: 'idle',
      isStale: true
    }
  ],
  connections: [
    { id: 'c1', from: 'b1', to: 'b2' },
    { id: 'c2', from: 'b2', to: 'b3' }
  ]
};