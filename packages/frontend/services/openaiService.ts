const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

const parseApiResponse = async <T>(response: Response): Promise<T> => {
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(payload?.error || raw || `Request failed with ${response.status}`);
  }
  return payload as T;
};

export const generateText = async (
  modelId: string,
  prompt: string,
  systemInstruction?: string,
): Promise<string> => {
  const payload = await parseApiResponse<{ text?: string }>(
    await fetch(`${API_BASE}/api/generate-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, modelId, systemPrompt: systemInstruction }),
    }),
  );

  if (!payload.text) throw new Error('No text returned from backend.');
  return payload.text;
};

export const generateImage = async (
  modelId: string,
  prompt: string,
): Promise<{ url: string; mimeType: string }> => {
  const payload = await parseApiResponse<{ url?: string }>(
    await fetch(`${API_BASE}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, modelId }),
    }),
  );

  if (!payload.url) throw new Error('No image returned from backend.');
  const mimeType = payload.url.startsWith('data:')
    ? payload.url.slice(5, payload.url.indexOf(';')) || 'image/png'
    : 'image/png';
  return { url: payload.url, mimeType };
};
