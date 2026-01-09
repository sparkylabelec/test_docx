
import { GoogleGenAI } from "@google/genai";
import { ContentBlock } from "../types";

/**
 * 본문 내용을 기반으로 AI 초안을 작성하거나 내용을 확장합니다.
 * 공무원 보고서와 같은 전문적인 어투(개조식, 명사형 종결)를 지향합니다.
 */
export const generateAiWritingAssist = async (
  title: string,
  blocks: ContentBlock[],
  isSelection: boolean = false
): Promise<string> => {
  try {
    // Initializing with the correct named parameter as per guidelines.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    let contextText = `[문서 맥락]\n`;
    contextText += `제목: ${title || "(제목 없음)"}\n`;
    
    const contentToProcess = blocks[0]?.content || "";
    // HTML 태그를 제거하여 텍스트 분석 효율을 높임
    const cleanContent = contentToProcess.replace(/<[^>]*>?/gm, '').trim();

    if (isSelection) {
      contextText += `편집 대상 텍스트:\n${cleanContent}\n`;
    } else {
      contextText += `현재 전체 본문:\n${cleanContent}\n`;
    }

    const parts: any[] = [];
    
    // 멀티모달 데이터 처리 (이미지/비디오)
    const mediaBlocks = blocks.filter(b => b.type === 'image' || b.type === 'video');
    for (const b of mediaBlocks) {
      if (b.content && !b.content.startsWith('blob:')) {
        // base64 데이터에서 data URL 접두어가 있는 경우 이를 제거 (Gemini API는 순수 base64 데이터만 수용)
        const base64Data = b.content.includes(',') ? b.content.split(',')[1] : b.content;
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: b.mimeType || (b.type === 'image' ? 'image/jpeg' : 'video/mp4'),
          },
        });
      }
    }

    let taskPrompt = "";
    if (isSelection) {
      taskPrompt = `위의 [편집 대상 텍스트]를 공공기관 업무 보고서 스타일로 변환하라.
      1. 개조식(Bullet point)을 적극 활용할 것.
      2. '~함', '~임', '~바람' 등의 명사형 종결 어미를 사용할 것.
      3. 핵심 정보는 유지하되 행정 용어를 사용하여 격조 있게 다듬을 것.
      4. 부연 설명 없이 변환된 결과만 출력하라.`;
    } else {
      taskPrompt = `위의 제목과 맥락을 바탕으로 전문적인 공무 보고서 초안을 작성하라.
      1. 가독성이 높은 개조식 구성을 취할 것.
      2. 결과물만 출력하라.`;
    }

    parts.push({ text: `${contextText}\n\n[지시사항]\n${taskPrompt}` });

    // Using gemini-3-pro-preview for complex text tasks as per guidelines.
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        systemInstruction: "당신은 행정 문서 작성의 대가입니다. 모든 요청에 대해 부연 설명이나 인사 없이 즉시 '보고서체'로 변환된 텍스트만 출력합니다. 명확하고 정제된 언어를 사용하세요.",
        temperature: 0.2, // 일관된 결과물을 위해 온도를 낮춤
      },
    });

    // Directly access the .text property (not a method) from GenerateContentResponse.
    const result = response.text;
    if (!result) return isSelection ? cleanContent : "결과를 생성할 수 없습니다.";
    
    return result.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("AI 처리 중 오류가 발생했습니다.");
  }
};
