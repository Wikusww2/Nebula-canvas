import { ModelConfig } from './types.js';
export type { ModelConfig } from './types.js';

export const MODEL_LIBRARY: ModelConfig[] = [
  {
    id: 'gpt-5.1',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5.1',
    defaultParams: { temperature: 0.7, reasoning: 'high' },
  },
  {
    id: 'gpt-5.1-chat-latest',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5.1 Instant',
    defaultParams: { temperature: 0.7, reasoning: 'high' },
  },
  {
    id: 'gpt-5.1-codex',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5.1 Codex',
    defaultParams: { temperature: 0.4, reasoning: 'high' },
  },
  {
    id: 'gpt-5.1-codex-mini',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5.1 Codex Mini',
    defaultParams: { temperature: 0.4, reasoning: 'high' },
  },
  {
    id: 'gpt-5-nano',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5 Nano',
    defaultParams: { temperature: 1.0, reasoning: 'medium' },
  },
  {
    id: 'gemini-3-pro-preview',
    provider: 'google',
    type: 'text',
    displayName: 'Gemini 3 Pro',
    defaultParams: { temperature: 0.7, reasoning: 'high' },
  },
  {
    id: 'gpt-image-1',
    provider: 'openai',
    type: 'image',
    displayName: 'GPT Image 1',
    defaultParams: { size: '1024x1024' },
  },
  {
    id: 'gemini-3-pro-image-preview',
    provider: 'google',
    type: 'image',
    displayName: 'Gemini 3 Pro Image',
    defaultParams: { size: '512x512' },
  },
  {
    id: 'imagen-4.0-generate-001',
    provider: 'google',
    type: 'image',
    displayName: 'Imagen 4',
    defaultParams: { size: '1024x1024' },
  },
  {
    id: 'imagen-4.0-fast-generate-001',
    provider: 'google',
    type: 'image',
    displayName: 'Imagen 4 Fast',
    defaultParams: { size: '1024x1024' },
  },
  {
    id: 'imagen-4.0-ultra-generate-001',
    provider: 'google',
    type: 'image',
    displayName: 'Imagen 4 Ultra',
    defaultParams: { size: '1024x1024' },
  },
];
