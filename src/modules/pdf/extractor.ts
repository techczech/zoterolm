/**
 * PDF text extraction and conversion
 */

export interface ExtractionResult {
  text: string;
  pageCount: number;
  itemId: number;
  attachmentId: number;
}

export interface PDFData {
  base64: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

/**
 * Extract text from a PDF attachment
 */
export async function extractTextFromPDF(
  attachment: Zotero.Item,
): Promise<string> {
  if (!attachment.isAttachment()) {
    throw new Error("Item is not an attachment");
  }

  const contentType = attachment.attachmentContentType;
  if (contentType !== "application/pdf") {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  // Use Zotero's full-text extraction first
  try {
    const text = await extractUsingZoteroFullText(attachment);
    if (text && text.trim().length > 0) {
      return text;
    }
  } catch (e) {
    ztoolkit.log("Full text extraction failed, trying PDF worker", e);
  }

  // Fallback to PDF worker - pass the attachment ID
  return await extractUsingPDFWorker(attachment.id);
}

/**
 * Extract text using Zotero's full-text indexing cache
 */
async function extractUsingZoteroFullText(
  attachment: Zotero.Item,
): Promise<string> {
  // Try to get the cached full-text content file
  const cacheFile = Zotero.Fulltext.getItemCacheFile(attachment);

  if (cacheFile && (await cacheFile.exists())) {
    const content = await Zotero.File.getContentsAsync(cacheFile);
    if (content && String(content).trim().length > 0) {
      return String(content);
    }
  }

  // Not indexed yet - trigger indexing
  await Zotero.Fulltext.indexItems([attachment.id], { complete: true });

  // Try again after indexing
  const newCacheFile = Zotero.Fulltext.getItemCacheFile(attachment);
  if (newCacheFile && (await newCacheFile.exists())) {
    const content = await Zotero.File.getContentsAsync(newCacheFile);
    if (content && String(content).trim().length > 0) {
      return String(content);
    }
  }

  throw new Error("Could not extract text using full-text indexing");
}

/**
 * Extract text using Zotero's PDF worker (fallback)
 * @param attachmentId - The ID of the PDF attachment item
 */
async function extractUsingPDFWorker(attachmentId: number): Promise<string> {
  // Use Zotero's PDF worker to extract text - it expects the attachment item ID
  const result = await Zotero.PDFWorker.getFullText(attachmentId);

  if (!result || !result.text) {
    throw new Error("PDF worker could not extract text");
  }

  return result.text;
}

/**
 * Get PDF as base64 encoded string for vision models
 */
export async function getPDFAsBase64(
  attachment: Zotero.Item,
): Promise<PDFData> {
  if (!attachment.isAttachment()) {
    throw new Error("Item is not an attachment");
  }

  const contentType = attachment.attachmentContentType;
  if (contentType !== "application/pdf") {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const path = await attachment.getFilePathAsync();
  if (!path) {
    throw new Error("Could not get file path for attachment");
  }

  // Read the PDF file as bytes
  const data = await IOUtils.read(path);

  // Convert to base64
  const base64 = uint8ArrayToBase64(data);

  // Get file info
  const fileName = attachment.attachmentFilename || "document.pdf";

  return {
    base64,
    mimeType: "application/pdf",
    fileName,
    sizeBytes: data.length,
  };
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Avoid building a massive intermediate string and calling btoa() on it.
  // This implementation encodes directly from bytes.
  const base64abc =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let result = "";
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      base64abc[(n >> 18) & 63] +
      base64abc[(n >> 12) & 63] +
      base64abc[(n >> 6) & 63] +
      base64abc[n & 63];
  }

  // Remaining 1 or 2 bytes + padding
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = bytes[i] << 16;
    result +=
      base64abc[(n >> 18) & 63] + base64abc[(n >> 12) & 63] + "==";
  } else if (remaining === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    result +=
      base64abc[(n >> 18) & 63] +
      base64abc[(n >> 12) & 63] +
      base64abc[(n >> 6) & 63] +
      "=";
  }

  return result;
}

/**
 * Convert PDF text to simple HTML representation
 */
export function textToHtml(text: string, title?: string): string {
  // Escape HTML entities
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Convert paragraphs (double newlines)
  const withParagraphs = escaped
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  const titleHtml = title ? `<h1>${title}</h1>\n` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title || "Document"}</title>
</head>
<body>
${titleHtml}${withParagraphs}
</body>
</html>`;
}

/**
 * Get the first PDF attachment for an item
 */
export async function getFirstPDFAttachment(
  item: Zotero.Item,
): Promise<Zotero.Item | null> {
  if (item.isAttachment()) {
    if (item.attachmentContentType === "application/pdf") {
      return item;
    }
    return null;
  }

  const attachmentIds = item.getAttachments();
  for (const attachmentId of attachmentIds) {
    const attachment = await Zotero.Items.getAsync(attachmentId);
    if (
      attachment &&
      attachment.isAttachment() &&
      attachment.attachmentContentType === "application/pdf"
    ) {
      return attachment as Zotero.Item;
    }
  }

  return null;
}

/**
 * Extract text from an item (finds PDF attachment automatically)
 */
export async function extractTextFromItem(
  item: Zotero.Item,
): Promise<ExtractionResult> {
  const attachment = await getFirstPDFAttachment(item);

  if (!attachment) {
    throw new Error("No PDF attachment found for this item");
  }

  const text = await extractTextFromPDF(attachment);

  // Extract annotations and append to text
  const annotationsText = await extractAnnotationsText(attachment);
  const fullText = annotationsText
    ? `${text}\n\n--- User Annotations ---\n${annotationsText}`
    : text;

  // Estimate page count from text length (rough approximation)
  const estimatedPageCount = Math.max(1, Math.ceil(fullText.length / 3000));

  return {
    text: fullText,
    pageCount: estimatedPageCount,
    itemId: item.isAttachment() ? item.parentItemID || item.id : item.id,
    attachmentId: attachment.id,
  };
}

/**
 * Extract user annotations from a PDF attachment
 */
async function extractAnnotationsText(
  attachment: Zotero.Item,
): Promise<string | null> {
  try {
    const annotations = attachment.getAnnotations();
    if (annotations.length === 0) return null;

    const annotationTexts: string[] = [];

    for (const annotation of annotations) {
      const type = annotation.annotationType;
      const text = annotation.annotationText || "";
      const comment = annotation.annotationComment || "";
      const pageLabel = annotation.annotationPageLabel || "";

      let annotationEntry = `[Page ${pageLabel}] `;

      switch (type) {
        case "highlight":
          annotationEntry += `Highlight: "${text}"`;
          if (comment) annotationEntry += ` | Note: ${comment}`;
          break;
        case "note":
          annotationEntry += `Note: ${comment}`;
          break;
        case "underline":
          annotationEntry += `Underline: "${text}"`;
          if (comment) annotationEntry += ` | Note: ${comment}`;
          break;
        case "text":
          annotationEntry += `Text: "${text}"`;
          if (comment) annotationEntry += ` | Note: ${comment}`;
          break;
        default:
          if (text || comment) {
            annotationEntry += `${text} ${comment}`.trim();
          } else {
            continue; // Skip empty annotations
          }
      }

      annotationTexts.push(annotationEntry);
    }

    return annotationTexts.join("\n");
  } catch (error) {
    ztoolkit.log("Failed to extract annotations", error);
    return null;
  }
}

/**
 * Get PDF data from an item (finds PDF attachment automatically)
 */
export async function getPDFDataFromItem(item: Zotero.Item): Promise<PDFData> {
  const attachment = await getFirstPDFAttachment(item);

  if (!attachment) {
    throw new Error("No PDF attachment found for this item");
  }

  return getPDFAsBase64(attachment);
}

/**
 * Check if an item has a PDF attachment
 */
export async function hasPDFAttachment(item: Zotero.Item): Promise<boolean> {
  const attachment = await getFirstPDFAttachment(item);
  return attachment !== null;
}
