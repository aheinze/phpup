export function readWorkspaceState(value: unknown) {
  const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    selectedProjectId: typeof state.selectedProjectId === "string" ? state.selectedProjectId : null,
    sidebarWidth: typeof state.sidebarWidth === "number" && Number.isFinite(state.sidebarWidth)
      ? Math.max(160, Math.min(400, Math.round(state.sidebarWidth))) : 220,
  };
}
