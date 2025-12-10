/**
 * Unified LLM service
 */

import { getPref } from "../../utils/prefs";
import { callGemini, callGeminiWithPDF, testGeminiConnection } from "./gemini";
import { callOpenAI, callOpenAIWithImage, testOpenAIConnection } from "./openai";
import { 
  getModelById, 
  getEnabledModels,
  LLMProvider, 
  ModelInfo,
  modelSupportsVision,
} from "./models";

export type ContentType = "text" | "pdf" | "html";

export interface LLMRequest {
  prompt: string;
  content: string;
  modelId?: string;
  contentType?: ContentType;
  pdfBase64?: string;
}

export interface LLMResponse {
  text: string;
  modelId: string;
  provider: LLMProvider;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  models?: ModelInfo[];
}

/**
 * Test API connection for a provider
 */
export async function testConnection(
  provider: LLMProvider,
  apiKey: string,
): Promise<ConnectionTestResult> {
  switch (provider) {
    case "gemini":
      return testGeminiConnection(apiKey);
    case "openai":
      return testOpenAIConnection(apiKey);
    default:
      return { success: false, message: `Unknown provider: ${provider}` };
  }
}

/**
 * Unified LLM service that routes requests to the appropriate provider
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const modelId = request.modelId || (getPref("defaultModel") as string);
  const model = getModelById(modelId);

  if (!model) {
    throw new Error(`Unknown model: ${modelId}. Please refresh models in settings.`);
  }

  const contentType = request.contentType || "text";
  let text: string;

  // Check if we're trying to send PDF to a non-vision model
  if (contentType === "pdf" && !model.supportsVision) {
    throw new Error(`Model ${model.name} does not support PDF input. Please use text extraction or choose a vision-capable model.`);
  }

  switch (model.provider) {
    case "gemini":
      if (contentType === "pdf" && request.pdfBase64) {
        text = await callGeminiWithPDF(request.prompt, request.pdfBase64, modelId);
      } else {
        text = await callGemini(request.prompt, request.content, modelId);
      }
      break;
    case "openai":
      if (contentType === "pdf" && request.pdfBase64) {
        // OpenAI doesn't support PDF directly, would need to convert to images
        throw new Error("OpenAI does not support direct PDF input. Please use text extraction or Gemini.");
      } else {
        text = await callOpenAI(request.prompt, request.content, modelId);
      }
      break;
    default:
      throw new Error(`Unsupported provider: ${model.provider}`);
  }

  return {
    text,
    modelId,
    provider: model.provider,
  };
}

/**
 * Get the current provider based on preferences
 */
export function getCurrentProvider(): LLMProvider {
  return getPref("provider") as LLMProvider;
}

/**
 * Get the current model info
 */
export function getCurrentModel(): ModelInfo | undefined {
  const modelId = getPref("defaultModel") as string;
  return getModelById(modelId);
}

/**
 * Check if API key is configured for the given provider
 */
export function isProviderConfigured(provider: LLMProvider): boolean {
  switch (provider) {
    case "gemini":
      return !!(getPref("geminiApiKey") as string);
    case "openai":
      return !!(getPref("openaiApiKey") as string);
    default:
      return false;
  }
}

/**
 * Estimate token count for a string (rough approximation)
 * Uses ~4 characters per token as a rough estimate
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if content fits within the model's context window
 */
export function fitsInContextWindow(
  content: string,
  modelId?: string,
): boolean {
  const model = modelId
    ? getModelById(modelId)
    : getCurrentModel();
  
  if (!model) return false;

  const maxTokens = getPref("maxContextTokens") as number;
  const effectiveLimit = Math.min(model.contextWindow, maxTokens);
  const tokenCount = estimateTokenCount(content);

  return tokenCount <= effectiveLimit;
}

/**
 * Get models available for selection (enabled models)
 */
export function getAvailableModels(): ModelInfo[] {
  return getEnabledModels();
}

/**
 * Check if a model supports vision/PDF input
 */
export function canSendPDF(modelId: string): boolean {
  return modelSupportsVision(modelId);
}
