// Linux Island — development loader extension (uuid: island-dev@local).
//
// This file is installed verbatim by scripts/dev/dev-reload.sh, so the tests in
// tests/extension/dev-loader.test.js exercise the same module that GNOME loads.
//
// Why a loader: GNOME Shell caches ES modules per URL for the lifetime of the
// shell process, and `ReloadExtension` is deprecated in GNOME 49+. Importing the
// real extension from a fresh, versioned directory is the only way to pick up
// new JS without restarting the shell.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {DevGenerationTracker, isSafeTarget} from './dev-loader.js';

const POINTER_FILE = 'current.txt';

export default class IslandDevLoader extends Extension {
    constructor(...args) {
        super(...args);
        this._tracker = new DevGenerationTracker();
        this._instance = null;
        this._module = null;
        this._css = null;
        this._theme = null;
    }

    get stageRoot() {
        return `${GLib.get_user_runtime_dir()}/linux-island-dev`;
    }

    get pointerPath() {
        return `${this.stageRoot}/${POINTER_FILE}`;
    }

    /**
     * GNOME calls enable() synchronously, so the async import is started here
     * and committed only if its generation is still current.
     */
    enable() {
        const generation = this._tracker.begin();
        this._enableAsync(generation).catch(e => {
            if (this._tracker.isCurrent(generation))
                console.error(`Linux Island dev: enable failed: ${e}`);
        });
    }

    async _enableAsync(generation) {
        const [ok, bytes] = GLib.file_get_contents(this.pointerPath);
        if (!ok)
            throw new Error(`cannot read ${this.pointerPath}; run scripts/dev/dev-reload.sh install`);

        const dir = new TextDecoder().decode(bytes).trim();
        if (!isSafeTarget(dir, this.stageRoot))
            throw new Error(`refusing to load outside ${this.stageRoot}: ${dir}`);

        const module = await import(`file://${dir}/extension.js`);
        const instance = new module.default({
            ...this.metadata,
            dir: Gio.File.new_for_path(dir),
            path: dir,
        });
        await instance.enable();

        // A disable() or a newer reload may have happened while importing.
        const committed = this._tracker.commitIfCurrent(generation, () => {
            this._module = module;
            this._instance = instance;
            // Resolve theme/CSS only at commit time: a superseded generation
            // must not touch the stylesheet at all.
            this._theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            this._css = Gio.File.new_for_path(`${dir}/stylesheet.css`);
            if (this._css.query_exists(null))
                this._theme.load_stylesheet(this._css);
        });

        if (!committed) {
            // Do not leak a half-started instance from a superseded generation.
            try {
                instance.disable();
            } catch (e) {
                console.error(`Linux Island dev: stale cleanup failed: ${e}`);
            }
            return;
        }

        console.log(`Linux Island dev: generation ${generation} ready from ${dir}`);
    }

    disable() {
        this._tracker.invalidate();

        if (this._css && this._theme) {
            try {
                this._theme.unload_stylesheet(this._css);
            } catch (e) {
                console.error(`Linux Island dev: css unload failed: ${e}`);
            }
        }
        try {
            this._instance?.disable();
        } catch (e) {
            console.error(`Linux Island dev: instance disable failed: ${e}`);
        }

        this._instance = null;
        this._module = null;
        this._css = null;
        this._theme = null;
    }
}
