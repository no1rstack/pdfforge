import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { AiMessage, AiMode } from "../types/pdf";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface GeminiContext {
  fullText?: string;
  currentPageText?: string;
  selectedText?: string;
  mode: AiMode;
  isExternalResearchEnabled: boolean;
}

export async function generateAiResponse(
  prompt: string,
  history: AiMessage[],
  context: GeminiContext
): Promise<AiMessage> {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `You are an AI Assistant for a PDF editor (PDFForge). 
  Your goal is to help the user understand, analyze, and learn from the document.
  
  Current Mode: ${context.mode}
  
  Context:
  - Full Document Text: ${context.fullText?.substring(0, 5000) || "Not provided"}
  - Current Page Text: ${context.currentPageText || "Not provided"}
  - Selected Text: ${context.selectedText || "None"}
  
  Guidelines:
  1. Be concise and professional.
  2. If in 'learn' mode, provide step-by-step explanations and break down complex concepts.
  3. If in 'analyze' mode, focus on summaries, key takeaways, and structural hierarchy.
  4. If in 'assist' mode, focus on terminology clarification and rephrasing.
  5. Always cite sections of the document if possible.
  6. If external research is ${context.isExternalResearchEnabled ? "ENABLED" : "DISABLED"}, you ${context.isExternalResearchEnabled ? "CAN" : "MUST NOT"} use external knowledge outside the document.
  `;

  const contents = [
    ...history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    })),
    {
      role: "user" as const,
      parts: [{ text: prompt }]
    }
  ];

  const tools = context.isExternalResearchEnabled ? [{ googleSearch: {} }] : [];

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      tools,
    }
  });

  const text = response.text || "I'm sorry, I couldn't generate a response.";
  const groundingUrls = response.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.map(chunk => chunk.web?.uri)
    .filter((uri): uri is string => !!uri);

  return {
    id: Math.random().toString(36).substring(7),
    role: "model",
    text,
    timestamp: Date.now(),
    isGrounding: !!groundingUrls?.length,
    groundingUrls,
  };
}

export async function summarizeSelection(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Summarize the following text from a PDF document:\n\n${text}`,
    config: {
      systemInstruction: "You are a summarization expert. Provide a concise summary of the provided text.",
    }
  });
  return response.text || "Could not summarize.";
}

export async function explainConcept(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Explain this concept or text in simple terms:\n\n${text}`,
    config: {
      systemInstruction: "You are a teacher. Explain complex concepts simply and clearly.",
    }
  });
  return response.text || "Could not explain.";
}
