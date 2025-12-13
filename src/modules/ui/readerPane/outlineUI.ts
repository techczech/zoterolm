import { generateAndCacheOutline, getCachedOutline, Outline } from "../../reader/outline";

export async function generateOutlineFromCurrentItem(
  body: HTMLElement,
): Promise<void> {
  const outlineDiv = body.querySelector(
    "#zoterolm-reader-outline",
  ) as HTMLElement | null;
  if (outlineDiv) outlineDiv.innerHTML = "<em>Generating…</em>";

  try {
    const item = getCurrentContextItem();
    if (!item) throw new Error("No item available in reader context");

    await generateAndCacheOutline(item);
    await renderOutline(body);
  } catch (error) {
    if (outlineDiv) {
      outlineDiv.innerHTML = `<span style="color: red;">Error: ${(error as Error).message}</span>`;
    }
  }
}

export async function renderOutline(body: HTMLElement): Promise<void> {
  const outlineDiv = body.querySelector(
    "#zoterolm-reader-outline",
  ) as HTMLElement | null;
  if (!outlineDiv) return;

  try {
    const item = getCurrentContextItem();
    if (!item) {
      outlineDiv.innerHTML = "<em>No item selected.</em>";
      return;
    }

    const attachment = item.isAttachment() ? item : null;
    const parent = attachment?.parentItemID
      ? ((await Zotero.Items.getAsync(attachment.parentItemID)) as Zotero.Item)
      : item;

    const outline = await getCachedOutline(parent);
    outlineDiv.innerHTML = outline ? outlineToHtml(outline) : "<em>No outline yet.</em>";

    outlineDiv
      .querySelectorAll("[data-zoterolm-page]")
      .forEach((el: Element) => {
        el.addEventListener("click", (ev: Event) => {
          ev.preventDefault();
          const page = Number(
            (el as HTMLElement).getAttribute("data-zoterolm-page"),
          );
          if (!Number.isFinite(page) || page < 1) return;
          void navigateReaderToPage(page);
        });
      });
  } catch (error) {
    outlineDiv.innerHTML = `<span style="color: red;">Error: ${(error as Error).message}</span>`;
  }
}

function outlineToHtml(outline: Outline): string {
  const rows = outline.entries
    .map((e) => {
      const indent = Math.max(0, (e.level - 1) * 12);
      const title = escapeHtml(e.title);
      return `<div style="margin-left: ${indent}px;">
        <a href="#" data-zoterolm-page="${e.page}">${title}</a>
        <span style="color: #666; font-size: 0.85em;"> (p. ${e.page})</span>
      </div>`;
    })
    .join("");

  return `<div style="font-size: 0.95em;">${rows}</div>`;
}

async function navigateReaderToPage(page: number): Promise<void> {
  const reader = await ztoolkit.Reader.getReader(2000);
  if (!reader) return;

  const iframeWin = (reader as any)?._internalReader?._lastView?._iframeWindow;
  const pdfApp = iframeWin?.PDFViewerApplication;
  if (pdfApp?.pdfViewer) {
    pdfApp.pdfViewer.currentPageNumber = page;
  }
  if (typeof pdfApp?.page !== "undefined") {
    pdfApp.page = page;
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


