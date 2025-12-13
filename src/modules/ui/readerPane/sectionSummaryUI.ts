import { getCachedOutline, Outline } from "../../reader/outline";
import {
  generateAndCacheSectionSummary,
  getCachedSectionSummaries,
  SectionSummary,
} from "../../reader/sectionSummary";

export async function renderSectionSummaryUI(body: HTMLElement): Promise<void> {
  const select = body.querySelector(
    "#zoterolm-reader-section-select",
  ) as HTMLSelectElement | null;
  const out = body.querySelector(
    "#zoterolm-reader-section-summary",
  ) as HTMLElement | null;

  if (!select || !out) return;

  try {
    const item = getCurrentContextItem();
    if (!item) {
      select.innerHTML = "";
      out.textContent = "";
      return;
    }

    const attachment = item.isAttachment() ? item : null;
    const parent = attachment?.parentItemID
      ? ((await Zotero.Items.getAsync(attachment.parentItemID)) as Zotero.Item)
      : item;

    const outline = await getCachedOutline(parent);
    if (!outline) {
      select.innerHTML = `<option value="">No outline yet</option>`;
      out.textContent = "";
      return;
    }

    // Populate select if empty or outline changed (simple rebuild).
    select.innerHTML = outline.entries
      .map((e, idx) => {
        const label = `${"  ".repeat(Math.max(0, e.level - 1))}${e.title} (p. ${e.page})`;
        return `<option value="${idx}">${escapeHtml(label)}</option>`;
      })
      .join("");

    // Show latest cached summary for the currently selected section (if any).
    const idx = Number(select.value || 0);
    const summaries = await getCachedSectionSummaries(parent);
    const chosen = pickSummaryForIndex(outline, summaries, idx);
    out.textContent = chosen?.summary || "";
  } catch (e) {
    out.textContent = `Error: ${(e as Error).message}`;
  }
}

export async function summarizeSelectedSection(body: HTMLElement): Promise<void> {
  const select = body.querySelector(
    "#zoterolm-reader-section-select",
  ) as HTMLSelectElement | null;
  const out = body.querySelector(
    "#zoterolm-reader-section-summary",
  ) as HTMLElement | null;
  if (!select || !out) return;

  out.textContent = "Summarizing…";

  try {
    const item = getCurrentContextItem();
    if (!item) throw new Error("No item available in reader context");

    const attachment = item.isAttachment() ? item : null;
    const parent = attachment?.parentItemID
      ? ((await Zotero.Items.getAsync(attachment.parentItemID)) as Zotero.Item)
      : item;

    const outline = await getCachedOutline(parent);
    if (!outline) throw new Error("No outline available (generate one first)");

    const index = Number(select.value);
    const { title, startPage, endPage } = getRangeFromOutline(outline, index);

    const result = await generateAndCacheSectionSummary(item, title, startPage, endPage);
    out.textContent = result.summary.summary;
  } catch (e) {
    out.textContent = `Error: ${(e as Error).message}`;
  }
}

function getRangeFromOutline(outline: Outline, index: number): { title: string; startPage: number; endPage: number } {
  const entry = outline.entries[index];
  if (!entry) throw new Error("Invalid section selection");

  const startPage = entry.page;
  const next = outline.entries[index + 1];
  const endPage = next && next.page > startPage ? next.page - 1 : startPage;

  return { title: entry.title, startPage, endPage };
}

function pickSummaryForIndex(
  outline: Outline,
  summaries: SectionSummary[],
  index: number,
): SectionSummary | null {
  try {
    const { title, startPage, endPage } = getRangeFromOutline(outline, index);
    const matches = summaries.filter(
      (s) => s.title === title && s.startPage === startPage && s.endPage === endPage,
    );
    if (matches.length === 0) return null;
    matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return matches[0];
  } catch {
    return null;
  }
}

function getCurrentContextItem(): Zotero.Item | null {
  const ZoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const items = ZoteroPane?.getSelectedItems?.() || [];
  return (items[0] as Zotero.Item | undefined) || null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


