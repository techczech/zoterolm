/**
 * Reader Q&A utilities (ask about the currently selected annotation in the reader).
 */

import { callLLM } from "../llm/service";
import { getPref } from "../../utils/prefs";
import { createSummary, SummaryMetadata } from "../summaries/manager";

export type ReaderQAResult = {
  question: string;
  answer: string;
  modelId: string;
  selectedText: string;
  pageLabel?: string;
};

export async function askReaderSelection(question: string): Promise<ReaderQAResult> {
  const q = question.trim();
  if (!q) throw new Error("Question is empty");

  const reader = await ztoolkit.Reader.getReader(2000);
  if (!reader) throw new Error("No active reader found");

  const ann = ztoolkit.Reader.getSelectedAnnotationData(reader);
  const selectedText = (ann?.text || "").trim();
  const pageLabel = ann?.pageLabel ? String(ann.pageLabel) : undefined;

  if (!selectedText) throw new Error("No annotation selection");

  const modelId = String(getPref("defaultModel") || "");

  const prompt = [
    "Answer the user’s question based ONLY on the selected PDF annotation text.",
    "If the selection is insufficient, ask a clarifying question instead of guessing.",
    "",
    pageLabel ? `Page: ${pageLabel}` : "",
    `Selected text:\n${selectedText}`,
    "",
    `Question: ${q}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await callLLM({
    prompt,
    content: "",
    modelId,
    contentType: "text",
  });

  return {
    question: q,
    answer: response.text,
    modelId: response.modelId,
    selectedText,
    pageLabel,
  };
}

export async function saveReaderQAAsNote(
  parentItem: Zotero.Item,
  result: ReaderQAResult,
): Promise<void> {
  const metadata: SummaryMetadata = {
    model: result.modelId,
    prompt: "Reader Q&A",
    date: new Date().toISOString(),
    type: "question",
    question: result.question,
  };

  const header = [
    result.pageLabel ? `Page: ${result.pageLabel}` : "",
    "Selected text:",
    result.selectedText,
    "",
    "Answer:",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  await createSummary(parentItem, `${header}${result.answer}`, metadata);
}


