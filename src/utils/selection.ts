/**
 * Resolve a stored selection against currently available IDs.
 * Returns the stored ID if still present; otherwise falls back to the first available.
 */
export function resolveSelection(
  currentId: string | null | undefined,
  availableIds: string[],
): { resolved: string; changed: boolean } {
  if (availableIds.length === 0) {
    return { resolved: "", changed: false };
  }

  if (currentId && availableIds.includes(currentId)) {
    return { resolved: currentId, changed: false };
  }

  return { resolved: availableIds[0], changed: true };
}


