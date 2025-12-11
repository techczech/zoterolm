/**
 * Google Gemini API client
 */

import { getPref } from "../../utils/prefs";
import { ModelInfo, setGeminiModels } from "./models";

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

export interface GeminiModelListResponse {
  models: Array<{
    name: string;
    displayName: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
}

/**
 * Test Gemini API connection and fetch available models
 */
export async function testGeminiConnection(apiKey: string): Promise<{
  success: boolean;
  message: string;
  models?: ModelInfo[];
}> {
  if (!apiKey) {
    return { success: false, message: "API key is required" };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = (await response.json()) as unknown as GeminiError;
      return {
        success: false,
        message: `API error: ${errorData.error?.message || response.statusText}`,
      };
    }

    const data = (await response.json()) as unknown as GeminiModelListResponse;

    // Filter and transform models
    const models: ModelInfo[] = data.models
      .filter((m) => {
        // Only include generative models
        const methods = m.supportedGenerationMethods || [];
        return methods.includes("generateContent");
      })
      .map((m) => {
        // Extract model ID from name (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
        const id = m.name.replace("models/", "");

        // Determine if model supports vision based on name
        const supportsVision =
          id.includes("vision") ||
          id.includes("gemini-1.5") ||
          id.includes("gemini-2") ||
          id.includes("gemini-pro");

        return {
          id,
          name: m.displayName || id,
          provider: "gemini" as const,
          contextWindow: m.inputTokenLimit || 32000,
          outputTokens: m.outputTokenLimit || 8192,
          supportsVision,
        };
      })
      .sort((a, b) => {
        // Sort by name, putting newer versions first
        if (a.id.includes("2.0") && !b.id.includes("2.0")) return -1;
        if (!a.id.includes("2.0") && b.id.includes("2.0")) return 1;
        if (a.id.includes("1.5") && !b.id.includes("1.5")) return -1;
        if (!a.id.includes("1.5") && b.id.includes("1.5")) return 1;
        return a.name.localeCompare(b.name);
      });

    // Store fetched models
    setGeminiModels(models);

    return {
      success: true,
      message: `Connected successfully. Found ${models.length} models.`,
      models,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Call Gemini API with text content
 */
export async function callGemini(
  prompt: string,
  content: string,
  modelId: string,
): Promise<string> {
  const apiKey = getPref("geminiApiKey") as string;

  if (!apiKey) {
    throw new Error(
      "Gemini API key not configured. Please set it in preferences.",
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: content ? `${prompt}\n\n---\n\n${content}` : prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as unknown as GeminiError;
    throw new Error(
      `Gemini API error: ${errorData.error?.message || response.statusText}`,
    );
  }

  const data = (await response.json()) as unknown as GeminiResponse;

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("No response from Gemini API");
  }

  const candidate = data.candidates[0];
  if (!candidate.content?.parts || candidate.content.parts.length === 0) {
    throw new Error("Empty response from Gemini API");
  }

  return candidate.content.parts.map((p) => p.text).join("");
}

/**
 * Call Gemini API with PDF (base64 encoded)
 */
export async function callGeminiWithPDF(
  prompt: string,
  pdfBase64: string,
  modelId: string,
): Promise<string> {
  const apiKey = getPref("geminiApiKey") as string;

  if (!apiKey) {
    throw new Error(
      "Gemini API key not configured. Please set it in preferences.",
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as unknown as GeminiError;
    throw new Error(
      `Gemini API error: ${errorData.error?.message || response.statusText}`,
    );
  }

  const data = (await response.json()) as unknown as GeminiResponse;

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("No response from Gemini API");
  }

  const candidate = data.candidates[0];
  if (!candidate.content?.parts || candidate.content.parts.length === 0) {
    throw new Error("Empty response from Gemini API");
  }

  return candidate.content.parts.map((p) => p.text).join("");
}
