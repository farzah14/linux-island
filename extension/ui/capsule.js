// GNOME Shell Floating Dynamic Island UI actor
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {MediaView} from './mediaView.js';

export class Capsule {
    constructor({onControlAction, onInteractionEvent} = {}) {
        this._onControlAction = onControlAction ?? (() => {});
        this._onInteractionEvent = onInteractionEvent ?? (() => {});
        this._currentState = 'COMPACT';

        // Root floating island widget
        this._widget = new St.BoxLayout({
            name: 'linux-island-pill',
            style_class: 'linux-island__capsule',
            vertical: true,
            reactive: true,
            track_hover: true,
            can_focus: true,
        });

        // Compact pill row (always visible at top of island)
        this._compactRow = new St.BoxLayout({
            style: 'spacing: 8px;',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._icon = new St.Label({
            text: '🏝️',
            style: 'font-size: 13px;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._label = new St.Label({
            text: 'Island',
            style_class: 'linux-island__label',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._compactRow.add_child(this._icon);
        this._compactRow.add_child(this._label);
        this._widget.add_child(this._compactRow);

        // Expanded media card (shown when EXPANDED)
        this._mediaView = new MediaView({
            onControlAction: this._onControlAction,
        });
        if (this._mediaView.actor) {
            this._mediaView.actor.visible = false;
            this._widget.add_child(this._mediaView.actor);
        }

        // Hover handling
        this._widget.connect('notify::hover', () => {
            if (this._currentState === 'EXPANDED') return;
            const isHovered = this._widget.hover;
            this._onInteractionEvent(isHovered ? 'HOVER_ENTER' : 'HOVER_LEAVE');
        });

        // Click handling (toggles EXPANDED and COMPACT)
        this._widget.connect('button-press-event', () => {
            if (this._currentState === 'EXPANDED') {
                this._onInteractionEvent('DISMISS');
            } else {
                this._onInteractionEvent('CLICK');
            }
            return Clutter.EVENT_STOP;
        });

        // Keyboard Escape key dismiss
        this._widget.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._onInteractionEvent('DISMISS');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Auto re-center when dimensions change
        this._widget.connect('notify::allocation', () => this._relayout());
    }

    _relayout() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._widget)
            return;

        let width = this._widget.width;
        if (width <= 0) {
            const [, natW] = this._widget.get_preferred_width(-1);
            width = natW > 0 ? natW : 160;
        }

        // Position at the exact horizontal center of the primary monitor
        const x = Math.round(monitor.x + (monitor.width - width) / 2);
        // Position at top with an 8px aesthetic margin from the screen edge
        const y = monitor.y + 8;
        this._widget.set_position(x, y);
    }

    mount() {
        Main.layoutManager.addTopChrome(this._widget, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        Main.layoutManager.connectObject('monitors-changed', () => this._relayout(), this);
        this._relayout();
    }

    setVisible(visible) {
        if (this._widget) {
            this._widget.visible = Boolean(visible);
            if (visible) this._relayout();
        }
    }

    applyState(state) {
        this._currentState = state;
        if (!this._widget)
            return;

        if (state === 'HIDDEN') {
            this.setVisible(false);
            return;
        }

        this.setVisible(true);

        if (state === 'EXPANDED') {
            if (this._mediaView?.actor) {
                this._mediaView.actor.visible = true;
            }
            this._widget.remove_style_class_name('linux-island__capsule');
            this._widget.add_style_class_name('linux-island__preview');
        } else if (state === 'PREVIEW' || state === 'PEEK') {
            if (this._mediaView?.actor) {
                this._mediaView.actor.visible = false;
            }
            this._widget.remove_style_class_name('linux-island__capsule');
            this._widget.add_style_class_name('linux-island__preview');
        } else {
            // COMPACT
            if (this._mediaView?.actor) {
                this._mediaView.actor.visible = false;
            }
            this._widget.remove_style_class_name('linux-island__preview');
            this._widget.add_style_class_name('linux-island__capsule');
        }

        this._relayout();
    }

    setMedia(media) {
        if (this._label) {
            if (media && media.title && media.title.trim().length > 0) {
                const title = media.title.trim();
                const artist = (media.artist && media.artist.trim().length > 0) ? ` • ${media.artist.trim()}` : '';
                const fullText = title + artist;
                this._label.text = fullText.length > 36 ? fullText.slice(0, 34) + '...' : fullText;
                if (this._icon) {
                    this._icon.text = (media.playbackStatus === 'Playing') ? '🎵' : '⏸️';
                }
            } else {
                this._label.text = 'Island';
                if (this._icon) {
                    this._icon.text = '🏝️';
                }
            }
        }
        this._mediaView?.setMedia(media);
        this._relayout();
    }

    destroy() {
        Main.layoutManager.disconnectObject(this);
        try {
            this._mediaView?.destroy();
        } catch (_) {}
        this._mediaView = null;

        if (this._widget) {
            try {
                Main.layoutManager.removeChrome(this._widget);
                this._widget.destroy();
            } catch (_) {}
            this._widget = null;
        }
        this._compactRow = null;
        this._icon = null;
        this._label = null;
    }
}
