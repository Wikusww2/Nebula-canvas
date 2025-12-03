import { GoogleGenAI } from "@google/genai";
import { Block, BlockContent } from "../types";

// Helper to determine if we can use the real API
const getApiKey = () => process.env.API_KEY;

export const generateText = async (
  modelId: string, 
  prompt: string, 
  systemInstruction?: string
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      }
    });
    return response.text || "No response generated.";
  } catch (error) {
    console.error("Gemini Text Error:", error);
    throw error;
  }
};

export const generateImage = async (
  modelId: string,
  prompt: string
): Promise<{ url: string; mimeType: string }> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    
    // Iterate through parts to find the image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType;
        return {
          url: `data:${mimeType};base64,${base64Data}`,
          mimeType: mimeType
        };
      }
    }
    throw new Error("No image data returned from API");
  } catch (error) {
    console.error("Gemini Image Error:", error);
    throw error;
  }
};
