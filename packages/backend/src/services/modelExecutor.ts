// Server-side execution adapter used by the database-backed /run/:blockId route.
// The live lightweight generation routes live in server.ts; this fallback keeps
// the persisted project flow usable during local development without API keys.
export async function executeModel(block: any, inputs: any[]) {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (block.type === 'TEXT') {
        const prompt = (block.config as any)?.promptTemplate || '';
        const inputTexts = inputs.map(i => i.text).filter(Boolean).join('\n');
        return {
            text: [prompt, inputTexts].filter(Boolean).join('\n\n') || 'No prompt supplied.'
        };
    }

    if (block.type === 'IMAGE') {
        const svg = encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800">
              <rect width="640" height="800" fill="#050607"/>
              <circle cx="320" cy="300" r="210" fill="#3fa6ff" opacity="0.22"/>
              <path d="M320 180 C245 110 140 175 205 285 C92 335 155 470 275 420 C285 555 438 555 448 420 C565 470 628 335 435 285 C500 175 395 110 320 180Z" fill="none" stroke="#7dd3fc" stroke-width="10" stroke-linecap="round"/>
              <text x="320" y="650" fill="#f8fafc" font-family="Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle">Local Preview</text>
            </svg>
        `);
        return {
            assetId: null,
            url: `data:image/svg+xml,${svg}`
        };
    }

    return {};
}
