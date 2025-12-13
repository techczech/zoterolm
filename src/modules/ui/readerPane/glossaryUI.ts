import { generateAndCacheGlossary, getCachedGlossary, Glossary } from "../../reader/glossary";

export async function renderGlossary(body: HTMLElement): Promise<void> {
  const div = body.querySelector(
    "#zoterolm-reader-glossary",
  ) as HTMLElement | null;
  if (!div) return;

  try {
    const item = getCurrentContextItem();
    if (!item) {
      div.innerHTML = "<em>No item selected.</em>";
      return;
    }

    const attachment = item.isAttachment() ? item : null;
    const parent = attachment?.parentItemID
      ? ((await Zotero.Items.getAsync(attachment.parentItemID)) as Zotero.Item)
      : item;

    const glossary = await getCachedGlossary(parent);
    div.innerHTML = glossary ? glossaryToHtml(glossary) : "<em>No glossary yet.</em>";

    div.querySelectorAll("[data-zoterolm-term]").forEach((el: Element) => {
      el.addEventListener("click", (ev: Event) => {
        ev.preventDefault();
        const term = String((el as HTMLElement).getAttribute("data-zoterolm-term") || "");
        if (!term) return;
        void findInReader(term);
      });
    });
  } catch (e) {
    div.innerHTML = `<span style="color: red;">Error: ${(e as Error).message}</span>`;
  }
}

export async function generateGlossaryFromCurrentItem(body: HTMLElement): Promise<void> {
  const div = body.querySelector(
    "#zoterolm-reader-glossary",
  ) as HTMLElement | null;
  if (div) div.innerHTML = "<em>Generating…</em>";

  try {
    const item = getCurrentContextItem();
    if (!item) throw new Error("No item available in reader context");
    await generateAndCacheGlossary(item);
    await renderGlossary(body);
  } catch (e) {
    if (div) div.innerHTML = `<span style="color: red;">Error: ${(e as Error).message}</span>`;
  }
}

function glossaryToHtml(glossary: Glossary): string {
  const rows = glossary.entries
    .map((e) => {
      const term = escapeHtml(e.term);
      const def = escapeHtml(e.definition);
      return `<div style="margin-bottom: 8px;">
        <div><a href="#" data-zoterolm-term="${term}"><strong>${term}</strong></a></div>
        <div style="color:#333; font-size: 0.9em;">${def}</div>
      </div>`;
    })
    .join("");
  return `<div style="font-size: 0.95em;">${rows}</div>`;
}

async function findInReader(query: string): Promise<void> {
  const reader = await ztoolkit.Reader.getReader(2000);
  if (!reader) return;
  const iframeWin = (reader as any)?._internalReader?._lastView?._iframeWindow;
  const pdfApp = iframeWin?.PDFViewerApplication;

  // Best-effort pdf.js find.
  const findController = pdfApp?.findController;
  if (findController?.executeCommand) {
    findController.executeCommand("find", {
      query,
      phraseSearch: true,
      highlightAll: true,
    });
    return;
  }

  const eventBus = pdfApp?.eventBus;
  if (eventBus?.dispatch) {
    eventBus.dispatch("find", {
      query,
      phraseSearch: true,
      highlightAll: true,
    });
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


