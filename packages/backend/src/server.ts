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
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
const GOOGLE_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Lightweight proxy endpoints for live generation without touching DB
app.post('/api/generate-text', async (req, res) => {
    try {
        const { prompt, modelId = 'gpt-5-nano', reasoning } = req.body;
        if (!prompt || !process.env.OPENAI_API_KEY) {
            return res.status(400).json({ error: 'Missing prompt or API key' });
        }
        const effort =
            typeof reasoning === 'string'
                ? reasoning
                : typeof reasoning === 'object' && reasoning?.effort
                    ? reasoning.effort
                    : 'high';
        const reasoningPayload = effort ? { effort } : undefined;
        const completion = await openai.responses.create({
            model: modelId,
            input: [{ role: 'user', content: prompt }],
            reasoning: reasoningPayload,
        });
        const text = completion.output_text;
        res.json({ text });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Generation failed' });
    }
});

app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt, modelId = 'gemini-3-pro-image-preview', size = '1024x1024' } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        // If the caller picks a Gemini/Imagen model and we have a Google key, hit Gemini.
        const wantsGoogle = modelId.includes('gemini') || modelId.includes('imagen');
        if (wantsGoogle && GOOGLE_API_KEY) {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GOOGLE_API_KEY}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    // Do NOT set response_mime_type; Gemini image returns inlineData when available
                }),
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(err);
            }
            const payload = await response.json();
            const inline = payload?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
            if (!inline?.data) throw new Error('No image data returned');
            const url = `data:${inline.mimeType || 'image/png'};base64,${inline.data}`;
            return res.json({ url, prompt });
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.status(400).json({ error: 'Missing API key' });
        }

        // Default to OpenAI image generation
        const result = await openai.images.generate({
            model: 'gpt-image-1',
            prompt,
            size,
        });
        const url = result.data?.[0]?.url || '';
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
    const { name } = req.body;
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
    const block = await prisma.block.create({
        data: {
            canvasId,
            type,
            title: type === 'TEXT' ? 'New Prompt' : 'New Image',
            modelId: type === 'TEXT' ? 'gpt-4o-mini' : 'flux-schnell',
            positionX: x,
            positionY: y,
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
    const connection = await prisma.connection.create({
        data: { fromBlockId, toBlockId, kind }
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
