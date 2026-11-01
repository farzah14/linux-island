export function shouldHideIsland({
    enabled,
    fullscreenOnPrimary,
    isMaximized = false,
    activeWorkspaceFullscreen = undefined,
    inOverview = false,
}) {
    if (!enabled) return false;

    // Activities Overview shows every workspace; a fullscreen window behind
    // the overview must not hide the panel island.
    if (inOverview) return false;

    // Maximized window does NOT hide the island
    if (isMaximized && !fullscreenOnPrimary) {
        return false;
    }

    // Fullscreen on another non-active workspace does not hide Island on current workspace
    if (activeWorkspaceFullscreen === false) {
        return false;
    }

    // Conservative default on unknown compositor state
    if (typeof fullscreenOnPrimary !== 'boolean') {
        return true;
    }

    return fullscreenOnPrimary;
}
