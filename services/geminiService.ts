
import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { ContentBlock } from "../types";

export const generateAiWritingAssist = async (
  title: string,
  blocks: ContentBlock[]
): Promise<string> => {
  try {
    // API 호출 직전에 인스턴스를 생성하여 process.env.API_KEY를 안전하게 참조
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: Part[] = [];
    
    let contextText = `Act as a professional writing assistant. Based on this document draft:
    Title: ${title}\n\n`;

    blocks.forEach((block, index) => {
      if (block.type === 'text') {
        const textContent = block.content.replace(/<[^>]*>?/gm, ''); // Simple HTML strip
        contextText += `[Section ${index + 1}]: ${textContent}\n`;
      }
    });

    parts.push({ text: contextText + "\nPlease provide improvements or continue the writing based on the images, videos, and text provided." });

    // Add visual parts (images and videos) for multimodal context
    blocks.filter(b => b.type === 'image' || b.type === 'video').forEach(b => {
      // Content is expected to be Base64 string here (pre-processed by App.tsx)
      parts.push({
        inlineData: {
          data: b.content,
          mimeType: b.mimeType || (b.type === 'image' ? 'image/jpeg' : 'video/mp4'),
        },
      });
    });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
    });

    return response.text || "I'm sorry, I couldn't process the writing assistance request.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to get response from Gemini AI.");
  }
};