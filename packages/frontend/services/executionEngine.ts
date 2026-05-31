import { Block, Connection, Project } from '../types';
import { generateText, generateImage } from './openaiService';

// Mock execution delay to simulate network
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock Data for fallback
const MOCK_TEXT_RESPONSES = [
  "Based on the inputs, here is a creative refinement: The neon lights reflect off the wet pavement.",
  "#FF5733 (Persimmon)\n#33FF57 (Spring Green)\n#3357FF (Royal Blue)",
  "Analysis complete. The sentiment is overwhelmingly positive with a hint of mystery.",
];

const MOCK_IMAGE_URLS = [
  "https://picsum.photos/400/500?random=1",
  "https://picsum.photos/400/500?random=2",
  "https://picsum.photos/400/500?random=3",
];

export const executeBlock = async (
  block: Block, 
  project: Project
): Promise<Partial<Block['content']>> => {
  
  // 1. Resolve Upstream Inputs
  const incomingConnections = project.connections.filter(c => c.to === block.id);
  const upstreamBlocks = incomingConnections.map(c => project.blocks.find(b => b.id === c.from)).filter(Boolean) as Block[];
  
  // Collect inputs as a list of strings (simplified for MVP)
  const inputs = upstreamBlocks.map((b, i) => {
    if (b.type === 'TEXT') return b.content.text || '';
    if (b.type === 'IMAGE') return `[Image Reference: ${b.content.caption || 'Generated Image'}]`;
    return '';
  });

  // 2. Prepare Prompt
  let finalPrompt = '';
  
  if (block.type === 'TEXT') {
    let template = block.content.promptTemplate || '{{input1}}';
    // Simple interpolation
    inputs.forEach((input, index) => {
        template = template.replace(new RegExp(`{{input${index + 1}}}`, 'g'), input);
    });
    // Fallback concatenation if no template tags
    if (!template.includes('{{')) {
        finalPrompt = `${template}\n\nContext:\n${inputs.join('\n')}`;
    } else {
        finalPrompt = template;
    }
  } else {
    // Image prompt construction
    finalPrompt = block.content.imagePrompt || '';
    if (inputs.length > 0) {
        finalPrompt += ` based on: ${inputs.join(', ')}`;
    }
  }

  // 3. Execute Model
  const useRealApi = block.modelId.startsWith('gpt-');

  if (block.type === 'TEXT') {
    if (useRealApi) {
        const result = await generateText(block.modelId, finalPrompt, block.content.systemPrompt);
        return { text: result };
    } else {
        await delay(1500);
        return { text: `[MOCK ${block.modelId}]\n${MOCK_TEXT_RESPONSES[Math.floor(Math.random() * MOCK_TEXT_RESPONSES.length)]}\n\nInput used: ${finalPrompt.substring(0, 30)}...` };
    }
  } else {
    if (useRealApi) {
        const result = await generateImage(block.modelId, finalPrompt);
        return { url: result.url, caption: finalPrompt };
    } else {
        await delay(2000);
        return { 
            url: MOCK_IMAGE_URLS[Math.floor(Math.random() * MOCK_IMAGE_URLS.length)],
            caption: finalPrompt 
        };
    }
  }
};

// Helper to find downstream blocks that need to be marked stale
export const getDownstreamBlockIds = (blockId: string, connections: Connection[]): string[] => {
    return connections.filter(c => c.from === blockId).map(c => c.to);
};
