// GNOME Shell Floating Dynamic Island UI actor
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as GrabHelper from 'resource:///org/gnome/shell/ui/grabHelper.js';
import {MediaView, CAPSULE_SIZES} from './mediaView.js';
import {BeatBars} from './beatBars.js';
import {loadLocalArtwork} from '../lib/localArtwork.js';

export class Capsule {
    constructor({
        onControlAction,
        onInteractionEvent,
        onMediaOpen,
        onUpdateSettings,
        onSetActivePlayer,
        scheduler,
        artworkLoader,
        idleTimeoutMs = 10000,
    } = {}) {
        this._onControlAction = onControlAction ?? (() => {});
        this._onInteractionEvent = onInteractionEvent ?? (() => {});
        this._onMediaOpen = onMediaOpen ?? (() => {});
        this._onUpdateSettings = onUpdateSettings ?? (() => {});
        this._onSetActivePlayer = onSetActivePlayer ?? (() => {});
        this._scheduler = scheduler ?? {
            setTimeout: (fn, ms) => setTimeout(fn, ms),
            clearTimeout: id => clearTimeout(id),
        };
        this._loadArtwork = artworkLoader ?? (typeof loadLocalArtwork !== 'undefined' ? loadLocalArtwork : async () => null);
        this._idleTimeoutMs = idleTimeoutMs;
        this._idleTimer = null;
        this._isIdleCircle = false;
        this._circleArtKey = null;
        this._circleArtCancellable = null;
        this._circleArtGeneration = 0;
        this._currentState = 'COMPACT';
        this._animationEnabled = true;
        this._connected = true;
        this._hoverPreviewEnabled = true;
        this._lastMedia = null;

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
            y_expand: true,
            x_expand: true,
            reactive: true,
        });

        this._icon = new St.Label({
            text: '🏝️',
            style: 'font-size: 13px;',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._circleArtBox = new St.BoxLayout({
            style: 'width: 32px; height: 32px; border-radius: 999px;',
            style_class: 'linux-island__artwork linux-island__circle-thumbnail',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });
        this._circleArtIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            fallback_icon_name: 'audio-x-generic-symbolic',
            icon_size: 28,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._circleArtBox.add_child(this._circleArtIcon);
        this._circleArtBox.visible = false;

        this._label = new St.Label({
            text: 'Island',
            style_class: 'linux-island__label',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._compactRow.add_child(this._icon);
        this._compactRow.add_child(this._circleArtBox);
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
            const isHovered = this._widget.hover;
            if (isHovered) {
                this._clearIdleTimer();
                if (this._isIdleCircle)
                    this._exitIdleCircle();
                if (this._hoverPreviewEnabled && this._currentState !== 'EXPANDED')
                    this._onInteractionEvent('HOVER_ENTER');
            } else {
                if (this._currentState === 'COMPACT')
                    this._scheduleIdleTimer();
                if (this._hoverPreviewEnabled && this._currentState !== 'EXPANDED')
                    this._onInteractionEvent('HOVER_LEAVE');
            }
        });

        // Click on compact/circle expands it; click on expanded collapses it
        const handleClick = () => {
            this._clearIdleTimer();
            if (this._isIdleCircle)
                this._exitIdleCircle();
            if (this._currentState === 'EXPANDED') {
                this._onInteractionEvent('DISMISS');
            } else {
                this._onInteractionEvent('CLICK');
            }
            return Clutter.EVENT_STOP;
        };
        this._compactRow.connect('button-press-event', handleClick);
        this._widget.connect('button-press-event', (_actor, event) => {
            if (this._currentState === 'COMPACT' || this._currentState === 'PREVIEW') {
                return handleClick();
            }
            if (this._currentState === 'EXPANDED') {
                const source = event?.get_source?.();
                if (source && source !== this._widget) {
                    return Clutter.EVENT_PROPAGATE;
                }
                return handleClick();
            }
            return Clutter.EVENT_PROPAGATE;
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
        this._scheduleIdleTimer();
    }

    _scheduleIdleTimer() {
        this._clearIdleTimer();
        if (this._currentState !== 'COMPACT' || this._idleTimeoutMs <= 0)
            return;
        this._idleTimer = this._scheduler.setTimeout(() => {
            this._idleTimer = null;
            this._enterIdleCircle();
        }, this._idleTimeoutMs);
    }

    _clearIdleTimer() {
        if (this._idleTimer !== null) {
            this._scheduler.clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    _enterIdleCircle() {
        if (this._currentState !== 'COMPACT' || this._isIdleCircle)
            return;
        this._isIdleCircle = true;
        this._widget?.add_style_class_name('linux-island__capsule--circle');
        if (this._label) this._label.visible = false;
        if (this._beatBars?.actor) this._beatBars.actor.visible = false;

        const isPlaying = this._lastMedia?.playbackStatus === 'Playing' && this._connected;
        if (isPlaying) {
            if (this._icon) this._icon.visible = false;
            if (this._circleArtBox) this._circleArtBox.visible = true;
            this._updateCircleArtwork(this._lastMedia);
        } else {
            if (this._circleArtBox) this._circleArtBox.visible = false;
            if (this._icon) {
                this._icon.visible = true;
                this._icon.text = '🏝️';
            }
        }

        this._applySize();
        this._relayout();

        if (this._animationEnabled && St.Settings.get().enable_animations && this._widget) {
            this._widget.scale_x = 0.92;
            this._widget.scale_y = 0.92;
            this._widget.ease({
                scale_x: 1,
                scale_y: 1,
                duration: 220,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    _exitIdleCircle() {
        if (!this._isIdleCircle)
            return;
        this._isIdleCircle = false;
        this._widget?.remove_style_class_name('linux-island__capsule--circle');
        if (this._circleArtBox) this._circleArtBox.visible = false;
        if (this._label) this._label.visible = true;
        if (this._icon) this._icon.visible = true;
        if (this._beatBars?.actor) {
            this._beatBars.actor.visible = Boolean(this._lastMedia?.playbackStatus === 'Playing' && this._connected);
        }
        if (this._icon) {
            const isPlaying = Boolean(this._lastMedia?.playbackStatus === 'Playing' && this._connected);
            this._icon.text = isPlaying ? '🎵' : '🏝️';
        }

        this._applySize();
        this._relayout();

        if (this._animationEnabled && St.Settings.get().enable_animations && this._widget) {
            this._widget.scale_x = 0.96;
            this._widget.scale_y = 0.96;
            this._widget.ease({
                scale_x: 1,
                scale_y: 1,
                duration: 220,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    _updateCircleArtwork(media) {
        const uri = media?.albumArtUri ?? '';
        const key = JSON.stringify([media?.playerId, media?.title, uri]);
        if (key === this._circleArtKey || !this._circleArtIcon) return;
        this._circleArtKey = key;
        const generation = ++this._circleArtGeneration;
        this._circleArtCancellable?.cancel();
        this._circleArtCancellable = null;
        this._circleArtIcon.gicon = null;
        this._circleArtIcon.icon_name = 'audio-x-generic-symbolic';
        if (this._circleArtBox) {
            this._circleArtBox.style = 'width: 32px; height: 32px; border-radius: 999px;';
        }
        if (!uri || !Gio) return;
        this._circleArtCancellable = new Gio.Cancellable();
        this._loadArtwork(uri, this._circleArtCancellable).then(icon => {
            if (generation === this._circleArtGeneration && this._circleArtIcon && icon) {
                this._circleArtIcon.icon_name = null;
                this._circleArtIcon.gicon = icon;
                this._circleArtIcon.visible = true;
                if (this._circleArtBox) {
                    this._circleArtBox.visible = true;
                }
            }
        }).catch(() => {});
    }

    _relayout() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._widget)
            return;

        if (this._isIdleCircle && this._currentState === 'COMPACT') {
            const x = Math.round(monitor.x + (monitor.width - 36) / 2);
            const y = monitor.y + 8;
            this._widget.set_position(x, y);
            return;
        }

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

        if (state === 'COMPACT') {
            if (previousState !== 'COMPACT') {
                this._exitIdleCircle();
                this._scheduleIdleTimer();
            }
        } else {
            this._clearIdleTimer();
            this._exitIdleCircle();
        }

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
        this.setMedia(this._lastMedia, true);
    }

    _applySize() {
        if (!this._widget) return;
        if (this._isIdleCircle && this._currentState === 'COMPACT') {
            this._widget.style = 'width: 36px; height: 36px; min-width: 36px; min-height: 36px; max-width: 36px; max-height: 36px; padding: 0;';
            if (this._compactRow) {
                this._compactRow.style = 'spacing: 0; width: 36px; height: 36px;';
            }
            if (this._icon) {
                this._icon.style = 'font-size: 18px; text-align: center; margin: 0; padding: 0;';
            }
            return;
        }
        const compact = this._currentState === 'COMPACT' || this._currentState === 'PREVIEW';
        this._widget.style = compact ? `padding: ${this._sizePreset.padding};` : '';
        if (this._compactRow) {
            this._compactRow.style = 'spacing: 8px;';
        }
        if (this._label) this._label.style = `font-size: ${this._sizePreset.compactFont}px;`;
        if (this._icon) this._icon.style = `font-size: ${this._sizePreset.compactFont}px; text-align: center;`;
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
            if (this._isIdleCircle) {
                if (this._circleArtBox) this._circleArtBox.visible = false;
                if (this._icon) {
                    this._icon.visible = true;
                    this._icon.text = '🏝️';
                }
            }
        }
    }

    setMedia(media, force = false) {
        if (!this._connected)
            media = null;
        const trackChanged = force || (media?.playerId !== this._lastMedia?.playerId ||
            media?.title !== this._lastMedia?.title ||
            media?.artist !== this._lastMedia?.artist ||
            media?.albumArtUri !== this._lastMedia?.albumArtUri ||
            media?.playbackStatus !== this._lastMedia?.playbackStatus);
        this._lastMedia = media;
        this._beatBars.setPlayback(media?.playbackStatus === 'Playing', Boolean(media?.playerId), media?.audioLevels);
        if (this._isIdleCircle && this._beatBars?.actor) {
            this._beatBars.actor.visible = false;
        }
        if (this._label) {
            if (media && media.title && media.title.trim().length > 0) {
                const title = media.title.trim();
                const artist = (media.artist && media.artist.trim().length > 0) ? ` • ${media.artist.trim()}` : '';
                const fullText = title + artist;
                const characters = Array.from(fullText);
                const limit = this._sizePreset.limit;
                this._label.text = characters.length > limit ? characters.slice(0, limit - 1).join('') + '…' : fullText;
                if (this._icon && !this._isIdleCircle) {
                    this._icon.text = (media.playbackStatus === 'Playing') ? '🎵' : '🏝️';
                }
            } else {
                this._label.text = this._connected ? 'Island' : 'Core offline';
                if (this._icon && !this._isIdleCircle) {
                    this._icon.text = '🏝️';
                }
            }
        }

        if (this._isIdleCircle) {
            if (media?.playbackStatus === 'Playing') {
                if (this._icon) this._icon.visible = false;
                if (this._circleArtBox) this._circleArtBox.visible = true;
                this._updateCircleArtwork(media);
            } else {
                if (this._circleArtBox) this._circleArtBox.visible = false;
                if (this._icon) {
                    this._icon.visible = true;
                    this._icon.text = '🏝️';
                }
            }
        } else if (this._currentState === 'COMPACT' && trackChanged) {
            this._scheduleIdleTimer();
        }

        this._mediaView?.setMedia(media);
        if (trackChanged || this._isIdleCircle) {
            this._relayout();
        }
    }

    destroy() {
        this._clearIdleTimer();
        this._circleArtCancellable?.cancel();
        this._circleArtCancellable = null;
        this._circleArtIcon = null;
        this._circleArtBox = null;
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
