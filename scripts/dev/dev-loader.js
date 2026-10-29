// Linux Island dev loader: shared logic for the GNOME dev extension.
//
// Kept free of GNOME imports so the generation logic can be tested under Node.
// The GNOME-facing wrapper lives in scripts/dev/dev-loader-extension.js.

/**
 * Tracks async load generations so a superseded or cancelled import can never
 * commit its result. GNOME Shell calls enable()/disable() synchronously, so the
 * real loader starts async work and commits only if the generation is current.
 */
export class DevGenerationTracker {
    constructor() {
        this._current = 0;
        this._invalid = false;
    }

    get current() {
        return this._current;
    }

    /** Start a new generation, superseding any in-flight one. */
    begin() {
        this._invalid = false;
        return ++this._current;
    }

    /** Mark all in-flight generations as unusable (called from disable()). */
    invalidate() {
        this._invalid = true;
        this._current++;
    }

    isCurrent(generation) {
        return !this._invalid && generation === this._current;
    }

    /**
     * Run `commit` only if `generation` is still current.
     * @returns {boolean} whether the commit ran
     */
    commitIfCurrent(generation, commit) {
        if (!this.isCurrent(generation))
            return false;
        commit();
        return true;
    }
}

/**
 * Pure mode resolver mirroring scripts/dev/dev-session.sh.
 * @param {string} version GNOME Shell version, e.g. "50.1"
 * @param {boolean} devkitPresent whether mutter-devkit is installed
 */
export function resolveModeForTests(version, devkitPresent) {
    const major = Number.parseInt(String(version).split('.')[0], 10);
    if (!Number.isFinite(major))
        return 'unknown';
    if (major < 49)
        return 'nested';
    return devkitPresent ? 'devkit' : 'headless';
}

/**
 * Refuse to point the loader at the user's real extension directory.
 * @param {string} target directory the loader would import
 * @param {string} devRoot allowed staging root
 */
export function isSafeTarget(target, devRoot) {
    if (!target || !devRoot)
        return false;
    const norm = p => p.replace(/\/+$/, '');
    const t = norm(target);
    const root = norm(devRoot);
    if (t === root)
        return false;
    if (!t.startsWith(`${root}/`))
        return false;
    // The real user extension is never under the dev root, but guard anyway.
    return !/\/gnome-shell\/extensions\/linux-island@local$/.test(t);
}
