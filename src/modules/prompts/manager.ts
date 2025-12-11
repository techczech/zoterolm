/**
 * Prompt management using Zotero notes with special tags
 */

import { getPref, setPref } from "../../utils/prefs";
import { escapeHtml } from "../../utils/html";

export const PROMPT_TAG = "#zoterolm-prompt";

/**
 * Item metadata interface
 */
export interface ItemMetadata {
  title: string;
  authors: string;
  year: string;
  journal: string;
  abstract: string;
  tags: string;
}

export interface PromptTemplate {
  id: string; // Note item ID
  name: string;
  content: string;
  noteId: number;
}

/**
 * Default prompts to create when plugin is first used
 */
export const DEFAULT_PROMPTS: Array<{ name: string; content: string }> = [
  {
    name: "Academic Summary",
    content: `# Academic Summary

Please provide a comprehensive academic summary of the following document. Complete this template. Support every claim with exact quotes from the text.

## 1. Main Thesis/Argument:

What is the central claim or purpose of this work?

## 2. Key findings:

What are the most important results or conclusions?

## 3. Methodology:

What approach or methods were used? Mention details of models used, dates and exact population numbers.

## 4. Significance:

Why is this work important in its field? What it agrees and what it disagrees on and what does it build on.

## 5. Limitations:

What are the acknowledged limitations or gaps?

{{content}}`,
  },
  {
    name: "Key Points",
    content: `Extract the key points from the following document as a bulleted list. Focus on:

- Main arguments and claims
- Important findings or data
- Notable conclusions
- Practical implications
- Possible limitations

Format as clear, concise bullet points.

{{content}}`,
  },
  {
    name: "Critical Analysis",
    content: `# Critical Analysis

Provide a critical analysis of the following document.

Write your own critique of the methods and conclusion. Base it on the best knowledge and practices as a critical reviewer. Adopt the persona of a well known researcher in the field. For example, for statistical methods use the persona of Andrew Gelman, for analysis of conclusions use Scott Alexander, for linguistic issues use Mark Liberman.

Consider:

## 1. Formulation of the problem:

Is this dealing a well formulated problem in a way that represents the problem space and is addresable by research.

## 2. Methods  

Is it using appropriate methodology.

## 3. Evidence Quality:

How well-supported are the claims?

## 4. Literature review quality

How well is the relevant literature in the field identified.

##  5. Conclusion evaluation:

How much are the conclusions and general discussion warranted based on the strength of the evidence.

{{content}}`,
  },
  {
    name: "Literature Review Helper",
    content: `Analyze this document for use in a literature review.  Provide:

## 1. Citation-worthy claims:

Key statements that could be cited

## 2. Theoretical framework:

What theories or frameworks are used?

## 3. Research gaps identified:

What gaps does this work identify?

## 4. Connections:

How might this relate to other works in the field?

{{content}}`,
  },
  {
    name: "Meta-Summary (for collections)",
    content: `You are analyzing summaries of multiple academic documents from a collection. Please provide:

1. **Overview**: What themes connect these documents?
2. **Key Patterns**: What common findings or arguments emerge?
3. **Divergences**: Where do the documents disagree or differ?
4. **Synthesis**: What overall picture emerges from these works together?
5. **Gaps**: What topics or questions are not addressed by this collection?

The summaries are:

{{content}}`,
  },
  {
    name: "Academic Summary with Metadata",
    content: `Please provide a comprehensive academic summary of the following document.

**Document Information:**
- Title: {{title}}
- Authors: {{authors}}
- Year: {{year}}
- Journal: {{journal}}
- Tags: {{tags}}

**Content:**
{{content}}

Include:
1. **Main Thesis/Argument**: What is the central claim or purpose of this work?
2. **Key Findings**: What are the most important results or conclusions?
3. **Methodology**: What approach or methods were used?
4. **Significance**: Why is this work important in its field?
5. **Limitations**: What are the acknowledged limitations or gaps?

Keep the summary concise but thorough, around 300-500 words.`,
  },
  {
    name: "Annotated Summary",
    content: `Create a summary that incorporates both the document content and user annotations.

**Document:** {{title}} ({{authors}}, {{year}})

**Document Content:**
{{content}}

Focus on synthesizing the main ideas with the highlighted and annotated sections to provide a comprehensive overview. Pay special attention to the user annotations as they indicate important or interesting sections.`,
  },
  {
    name: "Research Context Summary",
    content: `Provide a summary of this research paper in the context of its field and time period.

**Publication Details:**
- Title: {{title}}
- Authors: {{authors}}
- Year: {{year}}
- Journal: {{journal}}
- Tags/Keywords: {{tags}}

**Abstract:**
{{abstract}}

**Full Content:**
{{content}}

Summarize the paper's contributions, methodology, and findings while considering:
1. How this work fits into the broader field
2. What problems it addresses
3. How it advances knowledge from previous work
4. Its impact and relevance today

Structure the summary to be useful for researchers wanting to quickly understand this paper's place in the literature.`,
  },
];

/**
 * Get all prompt templates from Zotero notes
 */
export async function getAllPrompts(): Promise<PromptTemplate[]> {
  const search = new Zotero.Search();
  search.addCondition("tag", "is", PROMPT_TAG);
  search.addCondition("itemType", "is", "note");

  const ids = await search.search();
  const prompts: PromptTemplate[] = [];

  for (const id of ids) {
    const note = await Zotero.Items.getAsync(id);
    if (note && note.isNote()) {
      const prompt = parsePromptNote(note as Zotero.Item);
      if (prompt) {
        prompts.push(prompt);
      }
    }
  }

  return prompts;
}

/**
 * Parse a note item into a PromptTemplate
 */
function parsePromptNote(note: Zotero.Item): PromptTemplate | null {
  const noteContent = note.getNote();
  if (!noteContent) return null;

  // Remove HTML tags for parsing
  const textContent = noteContent
    .replace(/<[^>]*>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

  const lines = textContent.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;

  // First non-empty line is the name
  const name = lines[0].trim();
  // Rest is the content
  const content = lines.slice(1).join("\n").trim();

  return {
    id: String(note.id),
    name,
    content,
    noteId: note.id,
  };
}

/**
 * Get a specific prompt by ID
 */
export async function getPromptById(
  promptId: string,
): Promise<PromptTemplate | null> {
  const noteId = parseInt(promptId, 10);
  if (isNaN(noteId)) return null;

  const note = await Zotero.Items.getAsync(noteId);
  if (!note || !note.isNote()) return null;

  return parsePromptNote(note as Zotero.Item);
}

/**
 * Get the default prompt (from preferences or first available)
 */
export async function getDefaultPrompt(): Promise<PromptTemplate | null> {
  const defaultId = getPref("defaultPromptId") as string;

  if (defaultId) {
    const prompt = await getPromptById(defaultId);
    if (prompt) return prompt;
  }

  // Fall back to first available prompt
  const prompts = await getAllPrompts();
  return prompts.length > 0 ? prompts[0] : null;
}

/**
 * Create a new prompt note
 */
export async function createPrompt(
  name: string,
  content: string,
): Promise<PromptTemplate> {
  const note = new Zotero.Item("note");

  // Format as HTML note
  const htmlContent = `<div><strong>${escapeHtml(name)}</strong></div>
<div><br></div>
<div>${escapeHtml(content).replace(/\n/g, "</div><div>")}</div>`;

  note.setNote(htmlContent);
  await note.saveTx();

  // Add the prompt tag
  note.addTag(PROMPT_TAG);
  await note.saveTx();

  return {
    id: String(note.id),
    name,
    content,
    noteId: note.id,
  };
}

/**
 * Create default prompts if none exist
 */
export async function createDefaultPrompts(): Promise<void> {
  const existing = await getAllPrompts();

  if (existing.length > 0) {
    ztoolkit.log("Prompts already exist, skipping default creation");
    return;
  }

  ztoolkit.log("Creating default prompts");

  let firstPromptId: string | null = null;

  for (const defaultPrompt of DEFAULT_PROMPTS) {
    const prompt = await createPrompt(
      defaultPrompt.name,
      defaultPrompt.content,
    );
    if (!firstPromptId) {
      firstPromptId = prompt.id;
    }
  }

  // Set the first prompt as default
  if (firstPromptId) {
    setPref("defaultPromptId", firstPromptId);
  }
}

/**
 * Extract metadata from a Zotero item
 */
export function extractItemMetadata(item: Zotero.Item): ItemMetadata {
  return {
    title: item.getDisplayTitle(),
    authors: item
      .getCreators()
      .map((c) => `${c.firstName} ${c.lastName}`)
      .join(", "),
    year: extractYearFromDate(item.getField("date") as string),
    journal:
      (item.getField("publicationTitle") as string) ||
      (item.getField("journalAbbreviation") as string) ||
      "",
    abstract: (item.getField("abstractNote") as string) || "",
    tags: item
      .getTags()
      .map((t) => t.tag)
      .join(", "),
  };
}

/**
 * Extract year from date field
 */
function extractYearFromDate(dateString: string): string {
  if (!dateString) return "";
  const match = dateString.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

/**
 * Apply a prompt template to content with optional metadata
 */
export function applyPrompt(
  prompt: PromptTemplate,
  content: string,
  metadata?: ItemMetadata,
): string {
  let processedPrompt = prompt.content;

  // Replace content placeholder
  processedPrompt = processedPrompt.replace(/\{\{content\}\}/g, content);

  // Replace metadata placeholders if metadata provided
  if (metadata) {
    processedPrompt = processedPrompt.replace(
      /\{\{title\}\}/g,
      metadata.title || "",
    );
    processedPrompt = processedPrompt.replace(
      /\{\{authors\}\}/g,
      metadata.authors || "",
    );
    processedPrompt = processedPrompt.replace(
      /\{\{year\}\}/g,
      metadata.year || "",
    );
    processedPrompt = processedPrompt.replace(
      /\{\{journal\}\}/g,
      metadata.journal || "",
    );
    processedPrompt = processedPrompt.replace(
      /\{\{abstract\}\}/g,
      metadata.abstract || "",
    );
    processedPrompt = processedPrompt.replace(
      /\{\{tags\}\}/g,
      metadata.tags || "",
    );
  }

  return processedPrompt;
}

/**
 * Delete a prompt
 */
export async function deletePrompt(promptId: string): Promise<void> {
  const noteId = parseInt(promptId, 10);
  if (isNaN(noteId)) return;

  const note = await Zotero.Items.getAsync(noteId);
  if (note) {
    await note.eraseTx();
  }
}
