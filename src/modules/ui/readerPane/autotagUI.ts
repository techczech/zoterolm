import {
  applySuggestion,
  getSuggestionsForItem,
  ignoreSuggestion,
  isAutoTagEnabled,
  setAutoTagEnabled,
  suggestTagsForMostRecentAnnotation,
  TagSuggestion,
} from "../../reader/autotag";

export function toggleAutoTagAndRerender(body: HTMLElement): void {
  setAutoTagEnabled(!isAutoTagEnabled());
  void renderTagSuggestions(body);
}

export async function suggestTagsFromCurrentItem(body: HTMLElement): Promise<void> {
  const div = body.querySelector(
    "#zoterolm-reader-tag-suggestions",
  ) as HTMLElement | null;
  if (div) div.innerHTML = "<em>Suggesting…</em>";

  try {
    const item = getCurrentContextItem();
    if (!item) throw new Error("No item available in reader context");
    await suggestTagsForMostRecentAnnotation(item);
    await renderTagSuggestions(body);
  } catch (error) {
    if (div) {
      div.innerHTML = `<span style="color: red;">Error: ${(error as Error).message}</span>`;
    }
  }
}

export async function renderTagSuggestions(body: HTMLElement): Promise<void> {
  const toggleBtn = body.querySelector(
    "#zoterolm-reader-autotag-toggle",
  ) as HTMLButtonElement | null;
  if (toggleBtn) {
    toggleBtn.textContent = isAutoTagEnabled()
      ? "Disable auto-tagging"
      : "Enable auto-tagging";
  }

  const div = body.querySelector(
    "#zoterolm-reader-tag-suggestions",
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

    const suggestions = await getSuggestionsForItem(parent);
    div.innerHTML = suggestions.length
      ? suggestionsToHtml(suggestions)
      : "<em>No suggestions.</em>";

    div.querySelectorAll("[data-zoterolm-apply]").forEach((el: Element) => {
      el.addEventListener("click", (ev: Event) => {
        ev.preventDefault();
        const id = Number(
          (el as HTMLElement).getAttribute("data-zoterolm-apply"),
        );
        if (!Number.isFinite(id)) return;
        void (async () => {
          await applySuggestion(parent, id);
          await renderTagSuggestions(body);
        })();
      });
    });

    div.querySelectorAll("[data-zoterolm-ignore]").forEach((el: Element) => {
      el.addEventListener("click", (ev: Event) => {
        ev.preventDefault();
        const id = Number(
          (el as HTMLElement).getAttribute("data-zoterolm-ignore"),
        );
        if (!Number.isFinite(id)) return;
        void (async () => {
          await ignoreSuggestion(parent, id);
          await renderTagSuggestions(body);
        })();
      });
    });
  } catch (error) {
    div.innerHTML = `<span style="color: red;">Error: ${(error as Error).message}</span>`;
  }
}

function suggestionsToHtml(suggestions: TagSuggestion[]): string {
  return suggestions
    .map((s) => {
      const tags = s.suggestedTags
        .map((t) => `<code>${escapeHtml(t)}</code>`)
        .join(" ");
      const preview = escapeHtml(s.sourceText).slice(0, 240);
      return `<div style="background:#f5f5f5; padding:8px; border-radius:4px; margin-bottom:8px;">
        <div style="font-size: 0.85em; color:#666; margin-bottom:6px;">
          Annotation ${s.annotationId} • ${escapeHtml(s.modelId)} • ${escapeHtml(s.createdAt)}
        </div>
        <div style="font-size:0.9em; margin-bottom:6px; white-space: pre-wrap;">${preview}</div>
        <div style="margin-bottom:6px;">${tags || "<em>No tags</em>"}</div>
        <div style="display:flex; gap:8px;">
          <a href="#" data-zoterolm-apply="${s.annotationId}">Apply</a>
          <a href="#" data-zoterolm-ignore="${s.annotationId}">Ignore</a>
        </div>
      </div>`;
    })
    .join("");
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


