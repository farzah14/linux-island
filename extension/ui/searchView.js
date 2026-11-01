// Web Search page for Linux Island FeatureCarousel.
// Engine chips + a single-line query entry that opens the default browser.

import {SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, buildSearchUrl, isValidNavigationUrl} from '../lib/searchEngines.js';

let St = null;
let Clutter = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
    } catch (_) {}
}

export class SearchSection {
    constructor({engine = DEFAULT_SEARCH_ENGINE, onSearch, onEngineChanged, onDismiss,
        engines = SEARCH_ENGINES} = {}) {
        this._engines = engines;
        this._engine = this._validEngine(engine);
        this._onSearch = onSearch ?? (() => {});
        this._onEngineChanged = onEngineChanged ?? (() => {});
        this._onDismiss = onDismiss ?? (() => {});

        this.actor = null;
        this._entry = null;
        this._engineButtons = {};

        if (St && Clutter) {
            this._build();
        }
    }

    _validEngine(id) {
        return this._engines.some(e => e.id === id) ? id : DEFAULT_SEARCH_ENGINE;
    }

    _build() {
        this.actor = new St.BoxLayout({
            vertical: true,
            style: 'width: 320px; height: 98px; spacing: 6px; padding: 0 4px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Engine chips row
        this._engineRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 4px;',
            x_align: Clutter.ActorAlign.CENTER,
        });
        for (const engine of this._engines) {
            const btn = new St.Button({
                style_class: 'linux-island__search-engine-btn',
                can_focus: true,
                accessible_name: 'Search with ' + engine.label,
                child: new St.Label({
                    text: engine.label,
                    style: 'font-size: 10px; font-weight: 600;',
                }),
            });
            btn.connect('clicked', () => {
                this.setEngine(engine.id);
                this._onEngineChanged?.(engine.id);
                // The chip is a focusable St.Button, so clicking it steals key
                // focus from the entry; hand it straight back for typing.
                this.focus();
            });
            this._engineButtons[engine.id] = btn;
            this._engineRow.add_child(btn);
        }
        this.actor.add_child(this._engineRow);

        // Entry + action row
        const entryRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._entry = new St.Entry({
            hint_text: 'Search the web…',
            x_expand: true,
            can_focus: true,
            style_class: 'linux-island__search-entry',
        });
        this._entry.clutter_text?.connect?.('activate', () => this._submit());
        this._entry.connect('key-press-event', (_actor, event) => {
            const sym = event.get_key_symbol();
            if (sym === Clutter.KEY_Escape) {
                this._onDismiss?.();
                return Clutter.EVENT_STOP;
            }
            if ((Clutter.KEY_Return !== undefined && sym === Clutter.KEY_Return) ||
                (Clutter.KEY_KP_Enter !== undefined && sym === Clutter.KEY_KP_Enter) ||
                (Clutter.KEY_ISO_Enter !== undefined && sym === Clutter.KEY_ISO_Enter)) {
                this._submit();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        entryRow.add_child(this._entry);

        this._actionBtn = new St.Button({
            style_class: 'linux-island__search-action',
            can_focus: true,
            accessible_name: 'Search the web',
            child: new St.Label({text: 'Search'}),
        });
        this._actionBtn.connect('clicked', () => this._submit());
        entryRow.add_child(this._actionBtn);
        this.actor.add_child(entryRow);

        this._hintLabel = new St.Label({
            text: 'Enter to search · Esc to close',
            style_class: 'linux-island__search-hint',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._hintLabel);

        this.setEngine(this._engine);
    }

    _submit() {
        const raw = typeof this._entry?.get_text === 'function'
            ? this._entry.get_text()
            : (this._entry?.text ?? '');
        const url = buildSearchUrl(this._engine, raw);
        // Never hand a non-web URL to the companion or the default browser:
        // the query is user input and buildSearchUrl only encodes it, so a
        // malformed engine template or future engine could yield anything.
        if (!isValidNavigationUrl(url)) return;
        if (typeof this._entry?.set_text === 'function') this._entry.set_text('');
        else if (this._entry) this._entry.text = '';
        this._onSearch?.(url);
    }

    setEngine(id) {
        const valid = this._validEngine(id);
        this._engine = valid;
        for (const [btnId, btn] of Object.entries(this._engineButtons)) {
            if (btnId === valid) btn.add_style_class_name('linux-island__search-engine-btn--active');
            else btn.remove_style_class_name('linux-island__search-engine-btn--active');
        }
    }

    setWidth(width) {
        if (!this.actor) return;
        this.actor.style = `width: ${width}px; height: 98px; spacing: 6px; padding: 0 4px;`;
        this.actor.width = width;
    }

    focus() {
        this._entry?.grab_key_focus?.();
        this._entry?.clutter_text?.grab_key_focus?.();
    }

    destroy() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
        this._entry = null;
        this._engineRow = null;
        this._actionBtn = null;
        this._hintLabel = null;
        this._engineButtons = {};
    }
}
