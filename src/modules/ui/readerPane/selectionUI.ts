export async function refreshSelection(body: HTMLElement): Promise<void> {
  const selection = body.querySelector(
    "#zoterolm-reader-selection",
  ) as HTMLElement | null;
  if (!selection) return;

  try {
    const reader = await ztoolkit.Reader.getReader(2000);
    if (!reader) {
      selection.textContent = "No active reader found.";
      return;
    }

    const selectedText = ztoolkit.Reader.getSelectedText(reader) || "";
    selection.textContent = selectedText.trim().length
      ? selectedText
      : "No annotation selection.";
  } catch (error) {
    selection.textContent = `Error reading selection: ${(error as Error).message}`;
  }
}


