/**
 * LLM Model management with dynamic fetching
 */

import { getPref, setPref } from "../../utils/prefs";

export type LLMProvider = "gemini" | "openai";

export interface ModelInfo {
  id: string;
  name: string;
  provider: LLMProvider;
  contextWindow: number;
  outputTokens: number;
  supportsVision?: boolean;
  enabled?: boolean;
}

// Fallback models if API fetch fails
export const FALLBACK_GEMINI_MODELS: ModelInfo[] = [
  {
    id: "gemini-2.0-flash-exp",
    name: "Gemini 2.0 Flash Experimental",
    provider: "gemini",
    contextWindow: 1000000,
    outputTokens: 8192,
    supportsVision: true,
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "gemini",
    contextWindow: 2000000,
    outputTokens: 8192,
    supportsVision: true,
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "gemini",
    contextWindow: 1000000,
    outputTokens: 8192,
    supportsVision: true,
  },
];

export const FALLBACK_OPENAI_MODELS: ModelInfo[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    contextWindow: 128000,
    outputTokens: 16384,
    supportsVision: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    contextWindow: 128000,
    outputTokens: 16384,
    supportsVision: true,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    contextWindow: 128000,
    outputTokens: 4096,
    supportsVision: true,
  },
];

// In-memory cache for fetched models
let cachedGeminiModels: ModelInfo[] | null = null;
let cachedOpenAIModels: ModelInfo[] | null = null;

/**
 * Get all available models (from cache or preferences)
 */
export function getAllModels(): ModelInfo[] {
  const gemini = getGeminiModels();
  const openai = getOpenAIModels();
  return [...gemini, ...openai];
}

/**
 * Get enabled models only (for runtime selection)
 */
export function getEnabledModels(): ModelInfo[] {
  const enabledIds = getEnabledModelIds();
  const allModels = getAllModels();

  if (enabledIds.length === 0) {
    // If no models explicitly enabled, return all
    return allModels;
  }

  return allModels.filter((m) => enabledIds.includes(m.id));
}

/**
 * Get enabled model IDs from preferences
 */
export function getEnabledModelIds(): string[] {
  const stored = getPref("enabledModels") as string;
  if (!stored) return [];
  try {
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
}

/**
 * Set enabled model IDs
 */
export function setEnabledModelIds(ids: string[]): void {
  setPref("enabledModels", JSON.stringify(ids));
}

/**
 * Get Gemini models (cached or fallback)
 */
export function getGeminiModels(): ModelInfo[] {
  if (cachedGeminiModels) {
    return cachedGeminiModels;
  }

  // Try to load from preferences
  const stored = getPref("geminiModels") as string;
  if (stored) {
    try {
      cachedGeminiModels = JSON.parse(stored) as ModelInfo[];
      return cachedGeminiModels;
    } catch {
      // Fall through to fallback
    }
  }

  return FALLBACK_GEMINI_MODELS;
}

/**
 * Get OpenAI models (cached or fallback)
 */
export function getOpenAIModels(): ModelInfo[] {
  if (cachedOpenAIModels) {
    return cachedOpenAIModels;
  }

  // Try to load from preferences
  const stored = getPref("openaiModels") as string;
  if (stored) {
    try {
      cachedOpenAIModels = JSON.parse(stored) as ModelInfo[];
      return cachedOpenAIModels;
    } catch {
      // Fall through to fallback
    }
  }

  return FALLBACK_OPENAI_MODELS;
}

/**
 * Store fetched Gemini models
 */
export function setGeminiModels(models: ModelInfo[]): void {
  cachedGeminiModels = models;
  setPref("geminiModels", JSON.stringify(models));
}

/**
 * Store fetched OpenAI models
 */
export function setOpenAIModels(models: ModelInfo[]): void {
  cachedOpenAIModels = models;
  setPref("openaiModels", JSON.stringify(models));
}

/**
 * Get model by ID
 */
export function getModelById(modelId: string): ModelInfo | undefined {
  return getAllModels().find((m) => m.id === modelId);
}

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(provider: LLMProvider): ModelInfo[] {
  return getAllModels().filter((m) => m.provider === provider);
}

/**
 * Check if a model supports vision (PDF/image input)
 */
export function modelSupportsVision(modelId: string): boolean {
  const model = getModelById(modelId);
  return model?.supportsVision ?? false;
}

/**
 * Clear cached models (force refresh)
 */
export function clearModelCache(): void {
  cachedGeminiModels = null;
  cachedOpenAIModels = null;
}

// For backwards compatibility
export const ALL_MODELS = getAllModels();
