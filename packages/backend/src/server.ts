import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { executeModel } from './services/modelExecutor.js';

// Load env from monorepo root (handles being started from /packages/backend)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
const MAX_PROMPT_LENGTH = 12000;
const DEFAULT_TEXT_MODEL = 'gpt-5.5';
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';

const cleanName = (value: unknown, fallback = 'Untitled Canvas') =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback;

const cleanPrompt = (value: unknown) =>
    typeof value === 'string' ? value.trim().slice(0, MAX_PROMPT_LENGTH) : '';

const getOpenAIClient = (apiKey: unknown) => {
    const requestKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (requestKey) return new OpenAI({ apiKey: requestKey });
    return openai;
};

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    });
});

// Lightweight proxy endpoints for live generation without touching DB
app.post('/api/generate-text', async (req, res) => {
    try {
        const { modelId = DEFAULT_TEXT_MODEL, reasoning, apiKey } = req.body;
        const prompt = cleanPrompt(req.body.prompt);
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        if (typeof modelId !== 'string' || !modelId.startsWith('gpt-')) {
            return res.status(400).json({ error: 'Unsupported OpenAI text model' });
        }

        const client = getOpenAIClient(apiKey);
        if (!client) {
            return res.status(400).json({ error: 'Missing OpenAI API key' });
        }
        const effort =
            typeof reasoning === 'string'
                ? reasoning
                : typeof reasoning === 'object' && reasoning?.effort
                    ? reasoning.effort
                    : 'high';
        const reasoningPayload = effort ? { effort } : undefined;
        const completion = await client.responses.create({
            model: modelId,
            input: [{ role: 'user', content: prompt }],
            ...(reasoningPayload ? { reasoning: reasoningPayload } : {}),
        } as any);
        const text = completion.output_text;
        res.json({ text });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Generation failed' });
    }
});

app.post('/api/generate-image', async (req, res) => {
    try {
        const { modelId = DEFAULT_IMAGE_MODEL, apiKey } = req.body;
        const prompt = cleanPrompt(req.body.prompt);
        const allowedSizes = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);
        const size = allowedSizes.has(req.body.size) ? req.body.size : '1024x1024';
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        if (typeof modelId !== 'string' || !modelId.startsWith('gpt-image-')) {
            return res.status(400).json({ error: 'Unsupported OpenAI image model' });
        }

        const client = getOpenAIClient(apiKey);
        if (!client) {
            return res.status(400).json({ error: 'Missing OpenAI API key' });
        }

        const result = await client.images.generate({
            model: modelId,
            prompt,
            size,
        } as any);
        const image = result.data?.[0];
        const url = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : '');
        if (!url) {
            throw new Error('No image URL returned from provider');
        }
        res.json({ url, prompt });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Image generation failed' });
    }
});

// Projects
app.get('/projects', async (req, res) => {
    const projects = await prisma.project.findMany({ orderBy: { updatedAt: 'desc' } });
    res.json(projects);
});

app.post('/projects', async (req, res) => {
    const name = cleanName(req.body.name);
    const project = await prisma.project.create({
        data: {
            name,
            canvases: {
                create: {} // Create default canvas
            }
        },
        include: { canvases: true }
    });
    res.json(project);
});

app.delete('/projects/:id', async (req, res) => {
    const { id } = req.params;
    await prisma.project.delete({ where: { id } });
    res.json({ success: true });
});

// Canvas
app.get('/projects/:projectId/canvas', async (req, res) => {
    const { projectId } = req.params;
    const canvas = await prisma.canvas.findFirst({
        where: { projectId },
        include: {
            blocks: {
                include: { outgoingConnections: true } // Simplified fetch, might need more
            }
        }
    });

    if (!canvas) return res.status(404).json({ error: 'Canvas not found' });

    // Fetch connections separately to flatten structure if needed, or rely on frontend to parse
    const connections = await prisma.connection.findMany({
        where: {
            fromBlock: { canvasId: canvas.id }
        }
    });

    res.json({ canvas, blocks: canvas.blocks, connections });
});

// Blocks
app.post('/blocks', async (req, res) => {
    const { canvasId, type, x, y } = req.body;
    if (!canvasId || !['TEXT', 'IMAGE'].includes(type)) {
        return res.status(400).json({ error: 'Invalid canvasId or block type' });
    }
    const block = await prisma.block.create({
        data: {
            canvasId,
            type,
            title: type === 'TEXT' ? 'New Prompt' : 'New Image',
            modelId: type === 'TEXT' ? DEFAULT_TEXT_MODEL : DEFAULT_IMAGE_MODEL,
            positionX: Number.isFinite(Number(x)) ? Number(x) : 0,
            positionY: Number.isFinite(Number(y)) ? Number(y) : 0,
            config: type === 'TEXT' ? { promptTemplate: '' } : { prompt: '' },
            isStale: true
        }
    });
    res.json(block);
});

app.put('/blocks/:id', async (req, res) => {
    const { id } = req.params;
    const { positionX, positionY, config, title, modelId } = req.body;
    const block = await prisma.block.update({
        where: { id },
        data: {
            positionX,
            positionY,
            config,
            title,
            modelId
        }
    });
    // Mark downstream as stale logic would go here
    res.json(block);
});

app.delete('/blocks/:id', async (req, res) => {
    const { id } = req.params;
    await prisma.block.delete({ where: { id } });
    res.json({ success: true });
});

// Connections
app.post('/connections', async (req, res) => {
    const { fromBlockId, toBlockId, kind } = req.body;
    if (!fromBlockId || !toBlockId || fromBlockId === toBlockId) {
        return res.status(400).json({ error: 'Invalid connection' });
    }
    const connection = await prisma.connection.create({
        data: { fromBlockId, toBlockId, kind: kind || 'TEXT_TO_TEXT' }
    });
    res.json(connection);
});

app.delete('/connections/:id', async (req, res) => {
    const { id } = req.params;
    await prisma.connection.delete({ where: { id } });
    res.json({ success: true });
});

// Execution
app.post('/run/:blockId', async (req, res) => {
    const { blockId } = req.params;

    try {
        const block = await prisma.block.findUnique({
            where: { id: blockId },
            include: {
                incomingConnections: {
                    include: { fromBlock: true }
                }
            }
        });

        if (!block) return res.status(404).json({ error: 'Block not found' });

        // Resolve inputs
        const inputs = [];
        for (const conn of block.incomingConnections) {
            // In a real app, we'd fetch the latest generation for the upstream block
            const upstreamGen = await prisma.generation.findFirst({
                where: { blockId: conn.fromBlockId },
                orderBy: { createdAt: 'desc' }
            });
            if (upstreamGen) {
                inputs.push({
                    blockId: conn.fromBlockId,
                    text: upstreamGen.textOutput,
                    assetId: upstreamGen.assetId
                });
            }
        }

        const result = await executeModel(block, inputs);

        // Save generation
        const generation = await prisma.generation.create({
            data: {
                blockId,
                modelId: block.modelId,
                payload: result,
                textOutput: result.text,
                assetId: result.assetId
            }
        });

        // Update block
        await prisma.block.update({
            where: { id: blockId },
            data: {
                outputRefId: generation.id,
                isStale: false
            }
        });

        res.json({ success: true, generation });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
