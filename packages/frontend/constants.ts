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
  { id: 'gpt-5.5', type: 'TEXT', name: 'GPT-5.5', provider: 'openai', description: 'Best for complex reasoning and coding' },
  { id: 'gpt-5.4', type: 'TEXT', name: 'GPT-5.4', provider: 'openai', description: 'Balanced frontier text generation' },
  { id: 'gpt-5.4-mini', type: 'TEXT', name: 'GPT-5.4 Mini', provider: 'openai', description: 'Lower-latency, lower-cost text generation' },
  { id: 'gpt-5.4-nano', type: 'TEXT', name: 'GPT-5.4 Nano', provider: 'openai', description: 'Fastest OpenAI text option' },
  { id: 'gpt-image-2', type: 'IMAGE', name: 'GPT Image 2', provider: 'openai', description: 'Latest OpenAI image generation' },
  { id: 'gpt-image-1.5', type: 'IMAGE', name: 'GPT Image 1.5', provider: 'openai', description: 'High-quality OpenAI image generation' },
  { id: 'gpt-image-1', type: 'IMAGE', name: 'GPT Image 1', provider: 'openai', description: 'Previous OpenAI image generation' },
  { id: 'gpt-image-1-mini', type: 'IMAGE', name: 'GPT Image 1 Mini', provider: 'openai', description: 'Cost-efficient image generation' },
  { id: 'mock-text', type: 'TEXT', name: 'Mock Text', provider: 'mock', description: 'Offline simulation' },
  { id: 'mock-image', type: 'IMAGE', name: 'Mock Image', provider: 'mock', description: 'Offline random images' },
];

const demoImageUrl = (title: string, accent: string) =>
  `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800">
      <rect width="640" height="800" fill="#050607"/>
      <circle cx="320" cy="310" r="230" fill="${accent}" opacity="0.24"/>
      <path d="M320 190 C246 112 140 175 205 285 C92 335 155 470 275 420 C285 555 438 555 448 420 C565 470 628 335 435 285 C500 175 395 112 320 190Z" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>
      <text x="320" y="650" fill="#f8fafc" font-family="Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle">${title}</text>
    </svg>
  `)}`;

export const DEMO_PROJECT: Project = {
  id: 'demo-glass-flower',
  name: 'Glass Flower Campaign',
  lastEdited: Date.now(),
  blocks: [
    {
      id: 'b1',
      type: 'IMAGE',
      title: 'Glass Flower Reference',
      modelId: 'gpt-image-2',
      x: 150,
      y: 150,
      width: 300,
      content: {
        url: demoImageUrl('Glass Flower', '#7dd3fc'),
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
      modelId: 'gpt-5.5',
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
      modelId: 'gpt-image-2',
      x: 950,
      y: 180,
      width: 300,
      content: {
        url: demoImageUrl('Flowers Blooming', '#fbbf24'),
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
