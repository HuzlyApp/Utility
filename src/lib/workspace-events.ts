/** Browser event so sibling client components can refresh after mutations. */
export const WORKSPACE_CANDIDATES_CHANGED = "workspace:candidates-changed";

export function notifyWorkspaceCandidatesChanged(workspaceId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(WORKSPACE_CANDIDATES_CHANGED, {
      detail: { workspaceId },
    })
  );
}

export function onWorkspaceCandidatesChanged(
  workspaceId: string,
  handler: () => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
    if (detail?.workspaceId === workspaceId) handler();
  };

  window.addEventListener(WORKSPACE_CANDIDATES_CHANGED, listener);
  return () => window.removeEventListener(WORKSPACE_CANDIDATES_CHANGED, listener);
}
