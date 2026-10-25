// GNOME Shell Floating Dynamic Island UI actor
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as GrabHelper from 'resource:///org/gnome/shell/ui/grabHelper.js';
import {MediaView, CAPSULE_SIZES} from './mediaView.js';
import {BeatBars} from './beatBars.js';

export class Capsule {
    constructor({onControlAction, onInteractionEvent, onMediaOpen, onUpdateSettings, onSetActivePlayer} = {}) {
        this._onControlAction = onControlAction ?? (() => {});
        this._onInteractionEvent = onInteractionEvent ?? (() => {});
        this._onMediaOpen = onMediaOpen ?? (() => {});
        this._onUpdateSettings = onUpdateSettings ?? (() => {});
        this._onSetActivePlayer = onSetActivePlayer ?? (() => {});
        this._currentState = 'COMPACT';
        this._animationEnabled = true;
        this._connected = true;
        this._hoverPreviewEnabled = true;

        // Root floating island widget
        this._widget = new St.BoxLayout({
            name: 'linux-island-pill',
            style_class: 'linux-island__capsule',
            vertical: true,
            reactive: true,
            track_hover: true,
            can_focus: true,
        });
        this._widget.set_pivot_point(0.5, 0);
        this._themePreference = 'system';
        this._systemSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._themeSettingsId = this._systemSettings.connect('changed::color-scheme', () => this._applyTheme());
        this._applyTheme();
        this._grabHelper = new GrabHelper.GrabHelper(this._widget);

        // Compact pill row (visible in COMPACT/PREVIEW/PEEK)
        this._compactRow = new St.BoxLayout({
            style: 'spacing: 8px;',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
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
        this._beatBars = new BeatBars();
        this._compactRow.add_child(this._beatBars.actor);
        this._widget.add_child(this._compactRow);

        // Expanded media card (shown when EXPANDED)
        this._mediaView = new MediaView({
            onControlAction: this._onControlAction,
            onDismiss: () => this._onInteractionEvent('DISMISS'),
            onThemeToggle: () => this.cycleTheme(),
            onSetActivePlayer: this._onSetActivePlayer,
        });
        if (this._mediaView.actor) {
            this._mediaView.actor.visible = false;
            this._widget.add_child(this._mediaView.actor);
        }
        this.setCapsuleSize('medium');

        // Hover handling
        this._widget.connect('notify::hover', () => {
            if (!this._hoverPreviewEnabled || this._currentState === 'EXPANDED') return;
            const isHovered = this._widget.hover;
            this._onInteractionEvent(isHovered ? 'HOVER_ENTER' : 'HOVER_LEAVE');
        });

        // Click on compact pill expands it
        this._compactRow.connect('button-press-event', () => {
            if (this._currentState !== 'EXPANDED') {
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
        const previousState = this._currentState;
        this._currentState = state;
        if (!this._widget)
            return;

        if (state !== 'EXPANDED')
            this._grabHelper.ungrab();

        this._widget.remove_all_transitions();
        this._widget.opacity = 255;
        this._widget.scale_x = 1;
        this._widget.scale_y = 1;

        if (state === 'HIDDEN') {
            this.setVisible(false);
            return;
        }

        this.setVisible(true);

        if (state === 'EXPANDED') {
            if (this._compactRow) {
                this._compactRow.visible = false;
            }
            if (this._mediaView?.actor) {
                this._mediaView.actor.visible = true;
            }
            this._widget.remove_style_class_name('linux-island__capsule');
            this._widget.add_style_class_name('linux-island__preview');
        } else if (state === 'PEEK') {
            if (this._compactRow) {
                this._compactRow.visible = true;
            }
            if (this._mediaView?.actor) {
                this._mediaView.actor.visible = false;
            }
            this._widget.remove_style_class_name('linux-island__capsule');
            this._widget.add_style_class_name('linux-island__preview');
        } else {
            // COMPACT/PREVIEW keep the same hitbox. Shrinking the padding on
            // hover can move the pointer outside and repeatedly toggle states.
            if (this._compactRow) {
                this._compactRow.visible = true;
            }
            if (this._mediaView?.actor) {
                this._mediaView.actor.visible = false;
            }
            this._widget.remove_style_class_name('linux-island__preview');
            this._widget.add_style_class_name('linux-island__capsule');
        }

        this._applySize();
        this._relayout();
        if (state === 'EXPANDED' && !this._grabHelper.grab({
            actor: this._widget,
            focus: this._widget,
            onUngrab: isUser => {
                if (isUser && this._currentState === 'EXPANDED')
                    this._onInteractionEvent('DISMISS');
            },
        })) {
            this._onInteractionEvent('DISMISS');
            return;
        }
        // The Shell also scales animation time according to accessibility settings.
        if (state === 'EXPANDED' && previousState !== 'EXPANDED') this._onMediaOpen();
        // Replace transitions rather than queueing them during rapid pointer input.
        const hoverOnly = [previousState, state].every(value =>
            value === 'COMPACT' || value === 'PREVIEW');
        if (state !== previousState && !hoverOnly && this._animationEnabled && St.Settings.get().enable_animations) {
            this._widget.opacity = 210;
            this._widget.scale_x = 0.96;
            this._widget.scale_y = 0.96;
            this._widget.ease({
                opacity: 255,
                scale_x: 1,
                scale_y: 1,
                duration: 220, // tokens.metrics.motionMs.standard
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    setHoverPreviewEnabled(enabled) {
        const next = enabled !== false;
        if (next === this._hoverPreviewEnabled || !this._widget) return;
        this._hoverPreviewEnabled = next;
        if (!next && this._currentState === 'PREVIEW')
            this._onInteractionEvent('HOVER_LEAVE');
        else if (next && this._widget.hover && this._currentState === 'COMPACT')
            this._onInteractionEvent('HOVER_ENTER');
    }

    setCapsuleSize(size) {
        if (!Object.hasOwn(CAPSULE_SIZES, size) || size === this._capsuleSize || !this._widget) return;
        this._capsuleSize = size;
        this._sizePreset = CAPSULE_SIZES[size];
        this._mediaView.setCapsuleSize(size);
        this._applySize();
        this.setMedia(this._lastMedia);
    }

    _applySize() {
        const compact = this._currentState === 'COMPACT' || this._currentState === 'PREVIEW';
        this._widget.style = compact ? `padding: ${this._sizePreset.padding};` : '';
        this._label.style = `font-size: ${this._sizePreset.compactFont}px;`;
        this._icon.style = `font-size: ${this._sizePreset.compactFont}px;`;
    }

    setTheme(theme) {
        if (!['light', 'dark', 'system'].includes(theme)) return;
        this._themePreference = theme;
        this._applyTheme();
        this._mediaView?.setTheme(theme);
    }

    setAvailablePlayers(players) {
        this._mediaView?.setAvailablePlayers(players);
    }

    cycleTheme() {
        const cycle = {
            'dark': 'light',
            'light': 'system',
            'system': 'dark',
        };
        const next = cycle[this._themePreference] ?? 'dark';
        this.setTheme(next);
        this._onUpdateSettings({theme: next});
    }

    _applyTheme() {
        const selected = this._themePreference === 'system'
            ? (this._systemSettings.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light')
            : this._themePreference;
        if (selected === this._currentTheme) return;
        this._widget.remove_style_class_name(`linux-island--${this._currentTheme}`);
        this._widget.add_style_class_name(`linux-island--${selected}`);
        this._currentTheme = selected;
    }

    setAnimationEnabled(enabled) {
        this._animationEnabled = enabled !== false;
        this._beatBars.setAnimationEnabled(enabled);
        this._mediaView?.setAnimationEnabled(enabled);
        if (!this._animationEnabled && this._widget) {
            this._widget.remove_all_transitions();
            this._widget.opacity = 255;
            this._widget.scale_x = 1;
            this._widget.scale_y = 1;
        }
    }

    setConnected(connected) {
        this._connected = Boolean(connected);
        this._mediaView?.setConnected(connected);
        if (!connected) {
            this._beatBars.setPlayback(false, false);
            this._label.text = 'Core offline';
            this._icon.text = '🏝️';
        }
    }

    setMedia(media) {
        if (!this._connected)
            media = null;
        this._lastMedia = media;
        this._beatBars.setPlayback(media?.playbackStatus === 'Playing', Boolean(media?.playerId), media?.audioLevels);
        if (this._label) {
            if (media && media.title && media.title.trim().length > 0) {
                const title = media.title.trim();
                const artist = (media.artist && media.artist.trim().length > 0) ? ` • ${media.artist.trim()}` : '';
                const fullText = title + artist;
                const characters = Array.from(fullText);
                const limit = this._sizePreset.limit;
                this._label.text = characters.length > limit ? characters.slice(0, limit - 1).join('') + '…' : fullText;
                if (this._icon) {
                    this._icon.text = (media.playbackStatus === 'Playing') ? '🎵' : '⏸️';
                }
            } else {
                this._label.text = this._connected ? 'Island' : 'Core offline';
                if (this._icon) {
                    this._icon.text = '🏝️';
                }
            }
        }
        this._mediaView?.setMedia(media);
        this._relayout();
    }

    destroy() {
        this._systemSettings.disconnect(this._themeSettingsId);
        this._grabHelper.ungrab();
        this._beatBars.destroy();
        Main.layoutManager.disconnectObject(this);
        try {
            this._mediaView?.destroy();
        } catch (_) {}
        this._mediaView = null;

        if (this._widget) {
            try {
                this._widget.remove_all_transitions();
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
