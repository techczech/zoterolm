/**
 * OpenAI API client
 */

import { getPref } from "../../utils/prefs";
import { ModelInfo, setOpenAIModels } from "./models";

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIError {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

export interface OpenAIModelListResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

// Known context windows for OpenAI models
const OPENAI_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4-turbo-preview": 128000,
  "gpt-4": 8192,
  "gpt-4-32k": 32768,
  "gpt-3.5-turbo": 16385,
  "gpt-3.5-turbo-16k": 16385,
  "o1-preview": 128000,
  "o1-mini": 128000,
};

// Models that support vision
const OPENAI_VISION_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4-vision-preview",
];

/**
 * Test OpenAI API connection and fetch available models
 */
export async function testOpenAIConnection(apiKey: string): Promise<{
  success: boolean;
  message: string;
  models?: ModelInfo[];
}> {
  if (!apiKey) {
    return { success: false, message: "API key is required" };
  }

  try {
    const url = "https://api.openai.com/v1/models";
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorData = (await response.json()) as unknown as OpenAIError;
      return {
        success: false,
        message: `API error: ${errorData.error?.message || response.statusText}`,
      };
    }

    const data = (await response.json()) as unknown as OpenAIModelListResponse;
    
    // Filter and transform models - only include chat models
    const chatModelPrefixes = ["gpt-4", "gpt-3.5", "o1"];
    
    const models: ModelInfo[] = data.data
      .filter((m) => {
        // Only include chat-capable models
        return chatModelPrefixes.some((prefix) => m.id.startsWith(prefix));
      })
      .filter((m) => {
        // Exclude fine-tuned models and specific variants
        return !m.id.includes(":") && !m.id.includes("instruct");
      })
      .map((m) => {
        const contextWindow = OPENAI_CONTEXT_WINDOWS[m.id] || 
          (m.id.includes("32k") ? 32768 : 
           m.id.includes("16k") ? 16385 : 
           m.id.includes("gpt-4") ? 8192 : 4096);
        
        const supportsVision = OPENAI_VISION_MODELS.some((v) => m.id.includes(v));
        
        return {
          id: m.id,
          name: formatOpenAIModelName(m.id),
          provider: "openai" as const,
          contextWindow,
          outputTokens: m.id.includes("o1") ? 32768 : 
                       m.id.includes("gpt-4o") ? 16384 : 4096,
          supportsVision,
        };
      })
      .sort((a, b) => {
        // Sort by preference: gpt-4o first, then gpt-4, then gpt-3.5
        const order = ["gpt-4o", "o1", "gpt-4-turbo", "gpt-4", "gpt-3.5"];
        const aOrder = order.findIndex((p) => a.id.startsWith(p));
        const bOrder = order.findIndex((p) => b.id.startsWith(p));
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });

    // Store fetched models
    setOpenAIModels(models);

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
 * Format OpenAI model ID to a readable name
 */
function formatOpenAIModelName(id: string): string {
  return id
    .replace("gpt-", "GPT-")
    .replace("-turbo", " Turbo")
    .replace("-preview", " Preview")
    .replace("-mini", " Mini")
    .replace("o1", "o1");
}

/**
 * Call OpenAI API with text content
 */
export async function callOpenAI(
  prompt: string,
  content: string,
  modelId: string,
): Promise<string> {
  const apiKey = getPref("openaiApiKey") as string;

  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Please set it in preferences.");
  }

  const url = "https://api.openai.com/v1/chat/completions";

  const requestBody = {
    model: modelId,
    messages: [
      {
        role: "user",
        content: content ? `${prompt}\n\n---\n\n${content}` : prompt,
      },
    ],
    temperature: modelId.startsWith("o1") ? 1 : 0.7, // o1 models require temperature=1
    max_tokens: 4096,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as unknown as OpenAIError;
    throw new Error(
      `OpenAI API error: ${errorData.error?.message || response.statusText}`,
    );
  }

  const data = (await response.json()) as unknown as OpenAIResponse;

  if (!data.choices || data.choices.length === 0) {
    throw new Error("No response from OpenAI API");
  }

  const choice = data.choices[0];
  if (!choice.message?.content) {
    throw new Error("Empty response from OpenAI API");
  }

  return choice.message.content;
}

/**
 * Call OpenAI API with PDF (base64 encoded image pages)
 * Note: OpenAI doesn't support PDF directly, so we'd need to convert to images
 * For now, this sends as a data URL which works for images
 */
export async function callOpenAIWithImage(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  modelId: string,
): Promise<string> {
  const apiKey = getPref("openaiApiKey") as string;

  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Please set it in preferences.");
  }

  const url = "https://api.openai.com/v1/chat/completions";

  const requestBody = {
    model: modelId,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as unknown as OpenAIError;
    throw new Error(
      `OpenAI API error: ${errorData.error?.message || response.statusText}`,
    );
  }

  const data = (await response.json()) as unknown as OpenAIResponse;

  if (!data.choices || data.choices.length === 0) {
    throw new Error("No response from OpenAI API");
  }

  const choice = data.choices[0];
  if (!choice.message?.content) {
    throw new Error("Empty response from OpenAI API");
  }

  return choice.message.content;
}
