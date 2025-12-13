import { askReaderSelection, ReaderQAResult, saveReaderQAAsNote } from "../../reader/qa";

let lastQA: ReaderQAResult | null = null;

export function initQAState(body: HTMLElement): void {
  lastQA = null;
  const answer = body.querySelector("#zoterolm-reader-answer") as HTMLElement | null;
  if (answer) answer.textContent = "";
  const saveBtn = body.querySelector(
    "#zoterolm-reader-save-answer",
  ) as HTMLButtonElement | null;
  if (saveBtn) saveBtn.disabled = true;
}

export async function askFromSelection(body: HTMLElement): Promise<void> {
  const input = body.querySelector(
    "#zoterolm-reader-question",
  ) as HTMLInputElement | null;
  const answer = body.querySelector("#zoterolm-reader-answer") as HTMLElement | null;
  const saveBtn = body.querySelector(
    "#zoterolm-reader-save-answer",
  ) as HTMLButtonElement | null;

  if (saveBtn) saveBtn.disabled = true;
  if (answer) answer.textContent = "Asking…";

  try {
    const q = input?.value || "";
    const result = await askReaderSelection(q);
    lastQA = result;
    if (answer) answer.textContent = result.answer;
    if (saveBtn) saveBtn.disabled = false;
  } catch (error) {
    lastQA = null;
    if (answer) answer.textContent = `Error: ${(error as Error).message}`;
    if (saveBtn) saveBtn.disabled = true;
  }
}

export async function saveLastAnswer(body: HTMLElement): Promise<void> {
  if (!lastQA) return;

  const answer = body.querySelector("#zoterolm-reader-answer") as HTMLElement | null;
  if (answer) answer.textContent = "Saving…";

  try {
    const item = getCurrentContextItem();
    if (!item) throw new Error("No item available in reader context");

    const attachment = item.isAttachment() ? item : null;
    const parent = attachment?.parentItemID
      ? ((await Zotero.Items.getAsync(attachment.parentItemID)) as Zotero.Item)
      : item;

    await saveReaderQAAsNote(parent, lastQA);
    if (answer) answer.textContent = lastQA.answer;
  } catch (error) {
    if (answer) answer.textContent = `Error: ${(error as Error).message}`;
  }
}

function getCurrentContextItem(): Zotero.Item | null {
  const ZoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const items = ZoteroPane?.getSelectedItems?.() || [];
  return (items[0] as Zotero.Item | undefined) || null;
}


