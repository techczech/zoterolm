/**
 * Context window fitting for collection summaries
 */

import { getPref } from "../../utils/prefs";
import { getModelById } from "../llm/models";
import { estimateTokenCount, getCurrentModel } from "../llm/service";
import { Summary } from "./manager";

export interface FitResult {
  included: Summary[];
  excluded: Summary[];
  totalTokens: number;
  maxTokens: number;
  promptTokens: number;
}

export type SortStrategy = "date" | "alphabetical" | "size";

/**
 * Fit summaries into the context window
 */
export function fitSummariesInContext(
  summaries: Summary[],
  promptText: string,
  modelId?: string,
  sortStrategy: SortStrategy = "date",
): FitResult {
  const model = modelId ? getModelById(modelId) : getCurrentModel();
  const maxContextTokens = getPref("maxContextTokens") as number;

  // Use the smaller of model context window and user preference
  const effectiveMax = model
    ? Math.min(model.contextWindow, maxContextTokens)
    : maxContextTokens;

  // Reserve tokens for the prompt and some output
  const promptTokens = estimateTokenCount(promptText);
  const outputReserve = 4000; // Reserve for response
  const availableTokens = effectiveMax - promptTokens - outputReserve;

  // Sort summaries based on strategy
  const sortedSummaries = sortSummaries(summaries, sortStrategy);

  const included: Summary[] = [];
  const excluded: Summary[] = [];
  let totalTokens = 0;

  for (const summary of sortedSummaries) {
    const summaryTokens = estimateTokenCount(summary.content);

    if (totalTokens + summaryTokens <= availableTokens) {
      included.push(summary);
      totalTokens += summaryTokens;
    } else {
      excluded.push(summary);
    }
  }

  return {
    included,
    excluded,
    totalTokens,
    maxTokens: availableTokens,
    promptTokens,
  };
}

/**
 * Sort summaries based on strategy
 */
function sortSummaries(
  summaries: Summary[],
  strategy: SortStrategy,
): Summary[] {
  const sorted = [...summaries];

  switch (strategy) {
    case "date":
      // Most recent first
      sorted.sort((a, b) => {
        const dateA = new Date(a.metadata.date).getTime();
        const dateB = new Date(b.metadata.date).getTime();
        return dateB - dateA;
      });
      break;

    case "alphabetical":
      // Sort by content start (which often contains title)
      sorted.sort((a, b) => {
        return a.content.localeCompare(b.content);
      });
      break;

    case "size":
      // Smallest first (to fit more summaries)
      sorted.sort((a, b) => {
        return a.content.length - b.content.length;
      });
      break;
  }

  return sorted;
}

/**
 * Calculate how many summaries can fit
 */
export function calculateFitCapacity(
  summaries: Summary[],
  promptText: string,
  modelId?: string,
): { canFit: number; total: number; percentage: number } {
  const result = fitSummariesInContext(summaries, promptText, modelId);

  return {
    canFit: result.included.length,
    total: summaries.length,
    percentage:
      summaries.length > 0
        ? Math.round((result.included.length / summaries.length) * 100)
        : 100,
  };
}

/**
 * Get a preview of what will be included/excluded
 */
export function getFitPreview(
  summaries: Summary[],
  promptText: string,
  modelId?: string,
): string {
  const result = fitSummariesInContext(summaries, promptText, modelId);

  let preview = `Context Window Usage:\n`;
  preview += `- Prompt: ~${result.promptTokens} tokens\n`;
  preview += `- Summaries: ~${result.totalTokens} tokens\n`;
  preview += `- Available: ~${result.maxTokens} tokens\n\n`;

  preview += `Including ${result.included.length} of ${summaries.length} summaries:\n`;

  if (result.excluded.length > 0) {
    preview += `\nExcluded (${result.excluded.length}):\n`;
    for (const s of result.excluded) {
      preview += `- ${s.content.substring(0, 50)}...\n`;
    }
  }

  return preview;
}
