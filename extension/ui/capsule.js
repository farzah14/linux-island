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
        onWhatsAppActivate,
        scheduler,
        artworkLoader,
        idleTimeoutMs = 10000,
    } = {}) {
        this._onControlAction = onControlAction ?? (() => {});
        this._onInteractionEvent = onInteractionEvent ?? (() => {});
        this._onMediaOpen = onMediaOpen ?? (() => {});
        this._onUpdateSettings = onUpdateSettings ?? (() => {});
        this._onSetActivePlayer = onSetActivePlayer ?? (() => {});
        this._onWhatsAppActivate = onWhatsAppActivate ?? (() => {});
        this._whatsappEnabled = false;
        this._whatsappActivity = false;
        this._scheduler = scheduler ?? {
            setTimeout: (fn, ms) => setTimeout(fn, ms),
            clearTimeout: id => clearTimeout(id),
        };
        this._loadArtwork = artworkLoader ?? (typeof loadLocalArtwork !== 'undefined' ? loadLocalArtwork : async () => null);
        this._idleTimeoutMs = idleTimeoutMs;
        this._idleTimer = null;
        this._isIdleCircle = false;
        this._isPillExpanded = false;
        this._circleResizing = false;
        this._circleArtKey = null;
        this._circleArtCancellable = null;
        this._circleArtGeneration = 0;
        this._currentState = 'COMPACT';
        this._animationEnabled = true;
        this._connected = true;
        this._hoverPreviewEnabled = true;
        this._lastMedia = null;
        this._verticalOffset = 8;
        this._horizontalOffset = 0;
        this._searchEngine = 'google';
        this._companionActive = false;

        // Root floating island widget
        this._widget = new St.BoxLayout({
            name: 'linux-island-pill',
            clip_to_allocation: true,
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
        this._waDot = new St.Widget({
            style: 'width: 6px; height: 6px; border-radius: 3px;',
            style_class: 'linux-island__wa-dot',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._compactRow.add_child(this._waDot);
        this._widget.add_child(this._compactRow);

        // Expanded media card (shown when EXPANDED)
        this._mediaView = new MediaView({
            onControlAction: this._onControlAction,
            onDismiss: () => this._onInteractionEvent('DISMISS'),
            onThemeToggle: () => this.cycleTheme(),
            onSetActivePlayer: this._onSetActivePlayer,
            onUpdateSettings: this._onUpdateSettings,
            searchEngine: this._searchEngine,
            onCompanionStart: () => this.hideForCompanion(),
            onCompanionEnd: () => this.restoreFromCompanion(),
        });
        if (this._mediaView.actor) {
            this._mediaView.actor.visible = false;
            this._widget.add_child(this._mediaView.actor);
        }
        this._waActionRow = new St.BoxLayout({
            style_class: 'linux-island__wa-row',
            style: 'spacing: 8px; padding: 4px 10px; border-radius: 12px; margin-bottom: 4px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        const waDot = new St.Widget({
            style: 'width: 6px; height: 6px; border-radius: 3px;',
            style_class: 'linux-island__wa-dot',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const waLabel = new St.Label({
            text: 'New WhatsApp activity',
            style: 'font-size: 11px; font-weight: 600;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._waBtn = new St.Button({
            style_class: 'linux-island__player-badge',
            style: 'padding: 2px 8px; font-size: 10px;',
            can_focus: true,
            reactive: true,
            accessible_name: 'Open WhatsApp',
        });
        this._waBtn.set_child(new St.Label({text: 'Open WhatsApp'}));
        this._waBtn.connect('clicked', () => {
            this._onWhatsAppActivate();
            this.setWhatsAppActivity(false);
        });
        this._waActionRow.add_child(waDot);
        this._waActionRow.add_child(waLabel);
        this._waActionRow.add_child(this._waBtn);
        this._widget.add_child(this._waActionRow);
        this.setCapsuleSize('medium');

        // Hover handling
        this._widget.connect('notify::hover', () => {
            // While the companion window owns the screen, the pointer leaving
            // or entering the collapsed pill must not pop it back open.
            if (this._companionActive) return;
            const isHovered = this._widget.hover;
            if (isHovered) {
                this._clearIdleTimer();
                const wasCircle = this._isIdleCircle || (this._capsuleSize === 'circle' && !this._isPillExpanded);
                if (this._hoverPreviewEnabled && this._currentState !== 'EXPANDED')
                    this._onInteractionEvent('HOVER_ENTER');
                // applyState owns controller-driven PREVIEW transitions too.
                // Only wake here when hover preview is disabled (no state change).
                if (wasCircle && this._isCircleMode())
                    this._animateCircleToPill();
            } else {
                if (this._hoverPreviewEnabled && this._currentState !== 'EXPANDED')
                    this._onInteractionEvent('HOVER_LEAVE');
                if (this._capsuleSize === 'circle') {
                    this._animatePillToCircle();
                } else {
                    if (this._currentState === 'COMPACT')
                        this._scheduleIdleTimer();
                }
            }
        });

        // Click on compact/circle expands it. Expanded presses may begin a swipe.
        const handleClick = () => {
            this._clearIdleTimer();
            if (this._currentState === 'EXPANDED') {
                this._onInteractionEvent('DISMISS');
            } else {
                this._onInteractionEvent('CLICK');
            }
            return Clutter.EVENT_STOP;
        };
        this._compactRow.connect('button-press-event', handleClick);
        this._widget.connect('button-press-event', () => {
            if (this._currentState === 'COMPACT' || this._currentState === 'PREVIEW') {
                return handleClick();
            }
            // Do not dismiss on press: it may be the start of a carousel drag.
            // Outside clicks are observed on the stage; Escape also closes.
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

        // Capture outside presses at stage level, including events targeting other windows.
        this._outsideEventId = global.stage.connect('captured-event', (_actor, event) => {
            if (this._currentState !== 'EXPANDED')
                return Clutter.EVENT_PROPAGATE;

            const type = event.type();
            if (type === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape) {
                this._onInteractionEvent('DISMISS');
                return Clutter.EVENT_PROPAGATE;
            }
            if (type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.TOUCH_BEGIN) {
                if (typeof event.get_coords === 'function') {
                    const [stageX, stageY] = event.get_coords();
                    const [wX, wY] = this._widget.get_transformed_position ? this._widget.get_transformed_position() : (this._widget.position ?? [0, 0]);
                    const [wW, wH] = this._widget.get_transformed_size ? this._widget.get_transformed_size() : [this._widget.width ?? 0, this._widget.height ?? 0];
                    const inside = stageX >= wX && stageX <= (wX + wW) &&
                                   stageY >= wY && stageY <= (wY + wH);
                    if (!inside) {
                        this._onInteractionEvent('DISMISS');
                        return Clutter.EVENT_PROPAGATE;
                    }
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._widget.connect('notify::allocation', () => this._relayout());
        this._scheduleIdleTimer();
    }

    _isCircleMode() {
        return (this._isIdleCircle || (this._capsuleSize === 'circle' && !this._isPillExpanded)) &&
            this._currentState === 'COMPACT';
    }

    _scheduleIdleTimer() {
        this._clearIdleTimer();
        if (this._capsuleSize === 'circle' || this._currentState !== 'COMPACT' || this._idleTimeoutMs <= 0)
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

    _animateCircleToPill() {
        const fromWidth = this._widget.width;
        const fromHeight = this._widget.height;
        this._widget.remove_all_transitions();
        this._cancelCircleFades();
        this._widget.remove_style_class_name('linux-island__capsule--circle');
        this._isIdleCircle = false;
        this._isPillExpanded = true;
        this._circleResizing = true;

        const isPlaying = Boolean(this._lastMedia?.playbackStatus === 'Playing' && this._connected);
        // Remove the thumbnail from layout before measuring the pill. Keeping
        // both artwork and the music icon visible inflated the tween target.
        this._circleArtBox.visible = false;
        const labelWasVisible = this._label.visible;
        const barsWereVisible = this._beatBars.actor.visible;
        this._label.visible = true;
        this._icon.visible = true;
        this._icon.text = isPlaying ? '🎵' : '🏝️';
        this._beatBars.actor.visible = isPlaying;
        this._applySize();
        const [, width] = this._widget.get_preferred_width(-1);
        const [, height] = this._widget.get_preferred_height(width);
        const finish = () => {
            this._circleResizing = false;
            this._applySize();
            this._relayout();
        };
        if (this._animationEnabled && St.Settings.get().enable_animations) {
            this._widget.width = fromWidth > 0 ? fromWidth : 36;
            this._widget.height = fromHeight > 0 ? fromHeight : 36;
            this._relayout();
            for (const actor of [this._label, this._beatBars.actor]) {
                if (!actor.visible) continue;
                // Preserve the current opacity on a mid-flight reversal.
                if (actor === this._label ? !labelWasVisible : !barsWereVisible)
                    actor.opacity = 0;
                actor.ease({opacity: 255, duration: 220,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            }
            this._widget.ease({width, height, duration: 300,
                mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC, onComplete: finish});
        } else {
            this._label.opacity = 255;
            this._beatBars.actor.opacity = 255;
            finish();
        }
    }

    _cancelCircleFades() {
        for (const actor of [this._label, this._beatBars?.actor, this._circleArtBox])
            actor?.remove_all_transitions();
    }

    _animatePillToCircle() {
        if (this._currentState !== 'COMPACT' && this._currentState !== 'PREVIEW')
            return;
        if (this._isIdleCircle && !this._isPillExpanded) return;
        const fromWidth = this._widget.width;
        const fromHeight = this._widget.height;
        this._widget.remove_all_transitions();
        this._cancelCircleFades();
        this._circleResizing = true;
        this._isIdleCircle = true;
        this._isPillExpanded = false;
        this._widget.remove_style_class_name('linux-island__capsule--circle');
        this._widget.style = 'padding: 0;';
        const targetWidth = 36;
        const isPlaying = Boolean(this._lastMedia?.playbackStatus === 'Playing' && this._connected);

        if (this._animationEnabled && St.Settings.get().enable_animations && this._widget) {
            if (this._label) {
                this._label.ease({
                    opacity: 0,
                    duration: 140,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    onComplete: () => {
                        if (this._isCircleMode() && this._label) this._label.visible = false;
                    },
                });
            }
            if (this._beatBars?.actor) {
                this._beatBars.actor.ease({
                    opacity: 0,
                    duration: 140,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    onComplete: () => {
                        if (this._isCircleMode() && this._beatBars?.actor) this._beatBars.actor.visible = false;
                    },
                });
            }

            if (isPlaying) {
                if (this._icon) this._icon.visible = false;
                if (this._circleArtBox) {
                    this._circleArtBox.visible = true;
                    this._circleArtBox.opacity = 0;
                    this._circleArtBox.ease({
                        opacity: 255,
                        duration: 200,
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    });
                }
                this._updateCircleArtwork(this._lastMedia);
            } else {
                if (this._circleArtBox) this._circleArtBox.visible = false;
                if (this._icon) {
                    this._icon.visible = true;
                    this._icon.opacity = 255;
                    this._icon.text = '🏝️';
                }
            }

            this._widget.width = fromWidth > 0 ? fromWidth : targetWidth;
            this._widget.height = fromHeight > 0 ? fromHeight : 36;
            this._widget.ease({
                width: targetWidth,
                height: 36,
                duration: 300,
                mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
                onComplete: () => {
                    this._circleResizing = false;
                    this._widget?.add_style_class_name('linux-island__capsule--circle');
                    this._applySize();
                    this._relayout();
                },
            });
        } else {
            if (this._label) {
                this._label.visible = false;
                this._label.opacity = 0;
            }
            if (this._beatBars?.actor) {
                this._beatBars.actor.visible = false;
                this._beatBars.actor.opacity = 0;
            }
            if (isPlaying) {
                if (this._icon) this._icon.visible = false;
                if (this._circleArtBox) {
                    this._circleArtBox.visible = true;
                    this._circleArtBox.opacity = 255;
                }
                this._updateCircleArtwork(this._lastMedia);
            } else {
                if (this._circleArtBox) this._circleArtBox.visible = false;
                if (this._icon) {
                    this._icon.visible = true;
                    this._icon.opacity = 255;
                    this._icon.text = '🏝️';
                }
            }
            this._circleResizing = false;
            this._widget?.add_style_class_name('linux-island__capsule--circle');
            this._applySize();
            this._relayout();
        }
    }

    _enterIdleCircle() {
        if (this._currentState !== 'COMPACT' || this._isCircleMode())
            return;
        this._animatePillToCircle();
    }

    _exitIdleCircle() {
        if (!this._isIdleCircle && this._capsuleSize !== 'circle')
            return;
        this._isIdleCircle = false;
        this._isPillExpanded = false;
        this._widget?.remove_style_class_name('linux-island__capsule--circle');
        if (this._circleArtBox) this._circleArtBox.visible = false;
        if (this._label) {
            this._label.visible = true;
            this._label.opacity = 255;
        }
        if (this._icon) {
            this._icon.visible = true;
            this._icon.opacity = 255;
            const isPlaying = Boolean(this._lastMedia?.playbackStatus === 'Playing' && this._connected);
            this._icon.text = isPlaying ? '🎵' : '🏝️';
        }
        if (this._beatBars?.actor) {
            this._beatBars.actor.visible = Boolean(this._lastMedia?.playbackStatus === 'Playing' && this._connected);
            this._beatBars.actor.opacity = 255;
        }

        this._applySize();
        this._relayout();
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
        this._circleArtIcon.visible = true;
        if (this._circleArtBox) {
            this._circleArtBox.style = 'width: 32px; height: 32px; border-radius: 999px;';
        }
        if (!uri || !Gio) return;
        this._circleArtCancellable = new Gio.Cancellable();
        this._loadArtwork(uri, this._circleArtCancellable).then(icon => {
            if (generation === this._circleArtGeneration && this._circleArtIcon && icon) {
                // Paint vetted local art on the rounded St background: a rounded
                // parent does not clip the pixels of a child St.Icon.
                const localUri = icon.get_file?.()?.get_uri();
                if (localUri && this._circleArtBox) {
                    this._circleArtBox.style = `width: 32px; height: 32px; border-radius: 999px; background-size: cover; background-image: url(${JSON.stringify(localUri)});`;
                    this._circleArtIcon.visible = false;
                }
            }
        }).catch(() => {});
    }

    _relayout() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._widget)
            return;

        let width = this._widget.width;
        if (width <= 0) {
            const [, natW] = this._widget.get_preferred_width(-1);
            width = this._isCircleMode() ? 36 : (natW > 0 ? natW : 160);
        }

        // Position at the exact horizontal center of the primary monitor
        const x = Math.round(monitor.x + (monitor.width - width) / 2) + this._horizontalOffset;
        // Position at top with configurable vertical offset from the screen edge
        const y = monitor.y + this._verticalOffset;
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
        const fromWidth = this._widget?.width;
        const fromHeight = this._widget?.height;
        const wasCircle = this._isCircleMode();
        this._currentState = state;
        if (!this._widget || state === previousState)
            return;
        const hoverOnly = [previousState, state].every(value =>
            value === 'COMPACT' || value === 'PREVIEW');

        if (state !== 'EXPANDED')
            this._grabHelper.ungrab();

        this._widget.remove_all_transitions();
        for (const actor of [this._compactRow, this._mediaView?.actor]) {
            actor?.remove_all_transitions();
            if (actor) actor.opacity = 255;
        }
        this._widget.opacity = 255;
        this._widget.scale_x = 1;
        this._widget.scale_y = 1;


        if (state === 'COMPACT') {
            if (previousState !== 'COMPACT' && this._capsuleSize !== 'circle') {
                this._exitIdleCircle();
                this._scheduleIdleTimer();
            }
        } else if (!hoverOnly) {
            this._circleResizing = false;
            this._cancelCircleFades();
            this._clearIdleTimer();
            this._exitIdleCircle();
        }

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

        if (state === 'COMPACT' && this._capsuleSize === 'circle' && previousState !== 'COMPACT') {
            this._animatePillToCircle();
        } else if ((state === 'PREVIEW' && wasCircle) || (hoverOnly && this._circleResizing)) {
            this._widget.width = fromWidth;
            this._widget.height = fromHeight;
            this._animateCircleToPill();
        } else if (!this._circleResizing) {
            this._applySize();
        }
        this._relayout();
        this._syncWhatsAppVisibility();
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
        if (state === 'EXPANDED' && this._mediaView?._carousel?.currentPage === 3) {
            this._mediaView._searchSection?.focus();
        }
        // The Shell also scales animation time according to accessibility settings.
        if (state === 'EXPANDED' && previousState !== 'EXPANDED') this._onMediaOpen();
        // Replace transitions rather than queueing them during rapid pointer input.
        if (state !== previousState && !hoverOnly && !(state === 'COMPACT' && this._capsuleSize === 'circle') && this._animationEnabled && St.Settings.get().enable_animations) {
            // Measure the destination after swapping content, then animate from
            // the currently displayed allocation, including interrupted tweens.
            const [, width] = this._widget.get_preferred_width(-1);
            const [, height] = this._widget.get_preferred_height(width);
            this._widget.width = fromWidth > 0 ? fromWidth : width;
            this._widget.height = fromHeight > 0 ? fromHeight : height;
            this._relayout();
            const isExpanding = state === 'EXPANDED';
            const content = isExpanding ? this._mediaView?.actor : this._compactRow;
            if (content) {
                content.opacity = 0;
                content.ease({
                    opacity: 255,
                    duration: isExpanding ? 220 : 180, // tokens.metrics.motionMs.standard
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            }
            this._widget.ease({
                width,
                height,
                duration: isExpanding ? 300 : 220, // tokens.metrics.motionMs.emphasis / standard
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    this._applySize();
                    this._relayout();
                },
            });
        }
    }

    hideForCompanion() {
        this._companionActive = true;
        this._onInteractionEvent('DISMISS');
    }

    restoreFromCompanion() {
        this._companionActive = false;
    }


    setHoverPreviewEnabled(enabled) {
        const next = enabled !== false;
        if (next === this._hoverPreviewEnabled || !this._widget) return;
        this._hoverPreviewEnabled = next;
        if (!next && this._currentState === 'PREVIEW')
            this._onInteractionEvent('HOVER_LEAVE');
        else if (next && !this._companionActive && this._widget.hover
            && this._currentState === 'COMPACT')
            this._onInteractionEvent('HOVER_ENTER');
    }

    setCapsuleSize(size) {
        if (!Object.hasOwn(CAPSULE_SIZES, size) || size === this._capsuleSize || !this._widget) return;
        const previousSize = this._capsuleSize;
        this._capsuleSize = size;
        this._sizePreset = CAPSULE_SIZES[size];
        this._mediaView.setCapsuleSize(size);

        if (size === 'circle') {
            this._clearIdleTimer();
            if (this._currentState === 'COMPACT' && !this._widget.hover) {
                this._animatePillToCircle();
            }
        } else if (previousSize === 'circle') {
            this._exitIdleCircle();
            if (this._currentState === 'COMPACT' && !this._widget.hover) {
                this._scheduleIdleTimer();
            }
            this.setMedia(this._lastMedia, true);
        } else {
            this._applySize();
            this.setMedia(this._lastMedia, true);
        }
    }

    _applySize() {
        if (!this._widget) return;
        if (this._isCircleMode()) {
            this._widget.width = -1;
            this._widget.height = -1;
            this._widget.style = 'width: 36px; height: 36px; min-width: 36px; min-height: 36px; max-width: 36px; max-height: 36px; padding: 0;';
            if (this._compactRow) {
                this._compactRow.style = 'spacing: 0; width: 36px; height: 36px;';
            }
            if (this._icon) {
                this._icon.x_expand = true;
                this._icon.style = 'width: 32px; font-size: 18px; text-align: center; margin: 0; padding: 0;';
            }
            return;
        }
        // Width tweens leave an explicit Clutter size request behind. Release
        // it before natural layout, especially when the wider media card opens.
        this._widget.width = -1;
        this._widget.height = -1;
        const compact = this._currentState === 'COMPACT' || this._currentState === 'PREVIEW';
        this._widget.style = compact ? `padding: ${this._sizePreset.padding};` : '';
        if (this._compactRow) {
            this._compactRow.style = 'spacing: 8px;';
        }
        if (this._label) this._label.style = `font-size: ${this._sizePreset.compactFont}px;`;
        if (this._icon) {
            this._icon.x_expand = false;
            this._icon.style = `font-size: ${this._sizePreset.compactFont}px; text-align: center;`;
        }
    }

    setTheme(theme) {
        if (!['light', 'dark', 'system'].includes(theme)) return;
        this._themePreference = theme;
        this._applyTheme();
        this._mediaView?.setTheme(theme);
    }

    setSearchEngine(engine) {
        this._searchEngine = engine;
        this._mediaView?.setSearchEngine(engine);
    }

    setVerticalOffset(offset) {
        let val = Number(offset);
        if (Number.isNaN(val))
            val = 8;
        this._verticalOffset = Math.min(Math.max(Math.round(val), 0), 120);
        this._relayout();
    }

    setHorizontalOffset(offset) {
        let val = Number(offset);
        if (Number.isNaN(val))
            val = 0;
        this._horizontalOffset = Math.min(Math.max(Math.round(val), -500), 500);
        this._relayout();
    }
    setAvailablePlayers(players) {
        this._mediaView?.setAvailablePlayers(players);
    }

    setWhatsAppEnabled(enabled) {
        this._whatsappEnabled = Boolean(enabled);
        if (!this._whatsappEnabled) {
            this.setWhatsAppActivity(false);
        }
    }

    setWhatsAppActivity(hasActivity) {
        this._whatsappActivity = Boolean(hasActivity && this._whatsappEnabled);
        this._syncWhatsAppVisibility();
        this._relayout();
    }

    _syncWhatsAppVisibility() {
        if (!this._widget) return;
        const isExpanded = this._currentState === 'EXPANDED';
        const isCircle = this._isCircleMode();

        if (this._waDot) {
            this._waDot.visible = Boolean(this._whatsappActivity && !isExpanded && !isCircle);
        }
        if (this._waActionRow) {
            this._waActionRow.visible = Boolean(this._whatsappActivity && isExpanded);
        }
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
            this._circleResizing = false;
            this._cancelCircleFades();
            this._label.opacity = 255;
            this._beatBars.actor.opacity = 255;
            if (this._isCircleMode()) {
                this._widget.add_style_class_name('linux-island__capsule--circle');
                this._label.visible = false;
                this._beatBars.actor.visible = false;
                this._circleArtBox.opacity = 255;
            }
            this._widget.opacity = 255;
            this._widget.scale_x = 1;
            this._widget.scale_y = 1;
            for (const actor of [this._compactRow, this._mediaView?.actor]) {
                actor?.remove_all_transitions();
                if (actor) actor.opacity = 255;
            }
            this._applySize();
            this._relayout();
        }
    }

    setConnected(connected) {
        this._connected = Boolean(connected);
        this._mediaView?.setConnected(connected);
        if (!connected) {
            this._beatBars.setPlayback(false, false);
            this._label.text = 'Core offline';
            this._icon.text = '🏝️';
            if (this._isCircleMode()) {
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
        const isPlaying = media?.playbackStatus === 'Playing';
        this._lastMedia = media;
        this._beatBars.setPlayback(isPlaying, Boolean(media?.playerId), media?.audioLevels);
        if (this._beatBars?.actor) {
            this._beatBars.actor.visible = Boolean(isPlaying && !this._isCircleMode() && this._connected);
            if (isPlaying && !this._isCircleMode() && this._connected) {
                this._beatBars.actor.opacity = 255;
            }
        }
        if (this._label) {
            if (media && media.title && media.title.trim().length > 0) {
                const title = media.title.trim();
                const artist = (media.artist && media.artist.trim().length > 0) ? ` • ${media.artist.trim()}` : '';
                const fullText = title + artist;
                const characters = Array.from(fullText);
                const limit = this._sizePreset.limit;
                this._label.text = characters.length > limit ? characters.slice(0, limit - 1).join('') + '…' : fullText;
                if (this._icon && !this._isCircleMode()) {
                    this._icon.text = (media.playbackStatus === 'Playing') ? '🎵' : '🏝️';
                }
            } else {
                this._label.text = this._connected ? 'Island' : 'Core offline';
                if (this._icon && !this._isCircleMode()) {
                    this._icon.text = '🏝️';
                }
            }
        }

        if (this._isCircleMode()) {
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
        if (trackChanged || this._isCircleMode()) {
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
        global.stage.disconnect(this._outsideEventId);
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
        this._waDot = null;
        this._waBtn = null;
        this._waActionRow = null;
    }
}
