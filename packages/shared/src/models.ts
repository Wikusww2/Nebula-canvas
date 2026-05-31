import { ModelConfig } from './types.js';
export type { ModelConfig } from './types.js';

export const MODEL_LIBRARY: ModelConfig[] = [
  {
    id: 'gpt-5.5',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5.5',
    defaultParams: { temperature: 0.7, reasoning: 'xhigh' },
  },
  {
    id: 'gpt-5.4',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5.4',
    defaultParams: { temperature: 0.7, reasoning: 'high' },
  },
  {
    id: 'gpt-5.4-mini',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5.4 Mini',
    defaultParams: { temperature: 0.7, reasoning: 'medium' },
  },
  {
    id: 'gpt-5.4-nano',
    provider: 'openai',
    type: 'text',
    displayName: 'GPT-5.4 Nano',
    defaultParams: { temperature: 0.7, reasoning: 'low' },
  },
  {
    id: 'gpt-image-2',
    provider: 'openai',
    type: 'image',
    displayName: 'GPT Image 2',
    defaultParams: { size: '1024x1024' },
  },
  {
    id: 'gpt-image-1.5',
    provider: 'openai',
    type: 'image',
    displayName: 'GPT Image 1.5',
    defaultParams: { size: '1024x1024' },
  },
  {
    id: 'gpt-image-1',
    provider: 'openai',
    type: 'image',
    displayName: 'GPT Image 1',
    defaultParams: { size: '1024x1024' },
  },
  {
    id: 'gpt-image-1-mini',
    provider: 'openai',
    type: 'image',
    displayName: 'GPT Image 1 Mini',
    defaultParams: { size: '1024x1024' },
  },
];
