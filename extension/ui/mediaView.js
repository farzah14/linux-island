// Media presentation mapper and GNOME Shell UI view.
// Pure mapper runs in Node.js and GJS; UI actors constructed when GJS St/Clutter are available.
import {loadLocalArtwork} from '../lib/localArtwork.js';
import {BeatBars} from './beatBars.js';
import {estimateTimeline, formatTime} from '../lib/mediaTimeline.js';

export const CAPSULE_SIZES = Object.freeze({
    small: {width: 268, artwork: 40, button: 28, play: 36, icon: 12,
        title: 12, artist: 11, compactFont: 12, padding: '4px 12px', limit: 28},
    medium: {width: 328, artwork: 48, button: 32, play: 40, icon: 14,
        title: 13, artist: 12, compactFont: 13, padding: '6px 18px', limit: 36},
    large: {width: 388, artwork: 56, button: 36, play: 44, icon: 16,
        title: 14, artist: 13, compactFont: 14, padding: '8px 22px', limit: 44},
});

let St = null;
let Clutter = null;
let Gio = null;
let GLib = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
        Gio = (await import('gi://Gio')).default;
        GLib = (await import('gi://GLib')).default;
    } catch (_) {}
}

export function formatMediaPresentation(media) {
    if (!media || !media.playerId) {
        return {
            hasPlayer: false,
            title: 'No Media Playing',
            artist: '',
            playbackStatus: 'Stopped',
            isPlaying: false,
            canPlayPause: false,
            canNext: false,
            canPrevious: false,
            progress: 0.0,
        };
    }

    const title = (media.title && media.title.trim().length > 0)
        ? media.title.trim()
        : 'Unknown Title';

    const artist = (media.artist && media.artist.trim().length > 0)
        ? media.artist.trim()
        : 'Unknown Artist';

    const isPlaying = media.playbackStatus === 'Playing';
    const canPlayPause = Boolean(media.canPlay || media.canPause);
    const canNext = Boolean(media.canNext);
    const canPrevious = Boolean(media.canPrevious);

    let progress = 0.0;
    const dur = Number(media.durationUs || 0);
    const pos = Number(media.positionUs || 0);
    if (dur > 0 && pos >= 0) {
        progress = Math.min(1.0, Math.max(0.0, pos / dur));
    }

    return {
        hasPlayer: true,
        title,
        artist,
        playbackStatus: media.playbackStatus || 'Stopped',
        isPlaying,
        canPlayPause,
        canNext,
        canPrevious,
        progress,
    };
}

export class MediaView {
    /**
     * @param {Object} [options]
     * @param {Function} [options.onControlAction] - (action: string) => void
     * @param {Function} [options.onDismiss] - () => void
     * @param {Function} [options.artworkLoader] - async validated local icon loader
     */
    constructor({onControlAction, onDismiss, artworkLoader = loadLocalArtwork,
        clock = () => GLib ? GLib.get_monotonic_time() : 0, scheduler} = {}) {
        this._onControlAction = onControlAction ?? (() => {});
        this._onDismiss = onDismiss ?? (() => {});
        this._actor = null;
        this._titleLabel = null;
        this._artistLabel = null;
        this._playPauseBtn = null;
        this._nextBtn = null;
        this._prevBtn = null;
        this._connected = true;
        this._loadArtwork = artworkLoader;
        this._artIcon = null;
        this._artKey = null;
        this._artCancellable = null;
        this._artGeneration = 0;
        this._clock = clock;
        this._progressMedia = null;
        this._progressTimer = null;
        this._scheduler = scheduler ?? {
            repeat: fn => GLib ? GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                fn(); return GLib.SOURCE_CONTINUE;
            }) : null,
            cancel: id => { if (GLib) GLib.source_remove(id); },
        };

        if (St && Clutter) {
            this._buildUi();
            this._actor.connect('notify::mapped', () => {
                this._renderProgress();
                this._syncProgressTimer();
            });
            this.setMedia(null);
        }
    }

    get actor() {
        return this._actor;
    }

    _buildUi() {
        this._actor = new St.BoxLayout({
            vertical: true,
            style: 'width: 328px; padding: 8px 14px; spacing: 6px;',
            reactive: true,
        });

        // Track info row: Album art box on left, Title + Artist on right
        const trackRow = new St.BoxLayout({
            style: 'spacing: 10px;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const artBox = new St.BoxLayout({
            style: 'width: 48px; height: 48px; border-radius: 12px;',
            style_class: 'linux-island__artwork',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._artBox = artBox;
        this._artIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            fallback_icon_name: 'audio-x-generic-symbolic',
            icon_size: 48,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        artBox.add_child(this._artIcon);
        trackRow.add_child(artBox);

        const textCol = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 2px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._titleLabel = new St.Label({
            text: 'No Media Playing',
            x_expand: true,
            style: 'font-size: 13px; font-weight: bold;',
            style_class: 'linux-island__media-title',
        });
        if (this._titleLabel.clutter_text) {
            this._titleLabel.clutter_text.set_ellipsize(3);
        }

        this._artistLabel = new St.Label({
            text: '',
            x_expand: true,
            style: 'font-size: 12px;',
            style_class: 'linux-island__media-artist',
        });
        if (this._artistLabel.clutter_text) {
            this._artistLabel.clutter_text.set_ellipsize(3);
        }

        const titleRow = new St.BoxLayout({style: 'spacing: 8px;', x_expand: true});
        titleRow.add_child(this._titleLabel);
        this._beatBars = new BeatBars();
        titleRow.add_child(this._beatBars.actor);
        textCol.add_child(titleRow);
        textCol.add_child(this._artistLabel);
        trackRow.add_child(textCol);
        this._actor.add_child(trackRow);

        this._progressTrack = new St.Bin({
            style: 'height: 4px; border-radius: 2px;',
            style_class: 'linux-island__progress-track', x_expand: true,
        });
        this._progressFill = new St.Widget({
            style: 'height: 4px; border-radius: 2px;',
            style_class: 'linux-island__progress-fill',
            x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.CENTER,
        });
        this._progressTrack.set_child(this._progressFill);
        this._progressTrack.connect('notify::allocation', () => this._renderProgress());
        this._actor.add_child(this._progressTrack);

        // Playback controls row: [  ⏮  ]   [   ▶   ]   [  ⏭  ]
        const controlsBox = new St.BoxLayout({
            style: 'spacing: 8px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._elapsedLabel = new St.Label({text: '0:00', x_expand: true,
            y_align: Clutter.ActorAlign.CENTER, style: 'font-size: 10px; max-width: 64px;',
            style_class: 'linux-island__progress-time'});
        this._durationLabel = new St.Label({text: '--:--', x_expand: true,
            x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 10px; max-width: 64px;', style_class: 'linux-island__progress-time'});
        this._elapsedLabel.clutter_text?.set_ellipsize(3);
        this._durationLabel.clutter_text?.set_ellipsize(3);

        this._prevBtn = new St.Button({
            style: 'width: 32px; height: 32px; padding: 0; border-radius: 12px; font-size: 15px;',
            style_class: 'linux-island__media-button',
            accessible_name: 'Previous track',
            reactive: true,
            can_focus: true,
        });
        this._prevBtn.set_child(new St.Icon({icon_name: 'media-skip-backward-symbolic', icon_size: 14}));
        this._prevBtn.connect('clicked', () => this._onControlAction('Previous'));

        this._playPauseBtn = new St.Button({
            style: 'width: 40px; height: 32px; padding: 0; border-radius: 14px;',
            style_class: 'linux-island__media-button linux-island__media-button-primary',
            accessible_name: 'Play',
            reactive: true,
            can_focus: true,
        });
        this._playIcon = new St.Icon({icon_name: 'media-playback-start-symbolic', icon_size: 16});
        this._playPauseBtn.set_child(this._playIcon);
        this._playPauseBtn.connect('clicked', () => this._onControlAction('PlayPause'));

        this._nextBtn = new St.Button({
            style: 'width: 32px; height: 32px; padding: 0; border-radius: 12px; font-size: 15px;',
            style_class: 'linux-island__media-button',
            accessible_name: 'Next track',
            reactive: true,
            can_focus: true,
        });
        this._nextBtn.set_child(new St.Icon({icon_name: 'media-skip-forward-symbolic', icon_size: 14}));
        this._nextBtn.connect('clicked', () => this._onControlAction('Next'));

        controlsBox.add_child(this._elapsedLabel);
        controlsBox.add_child(this._prevBtn);
        controlsBox.add_child(this._playPauseBtn);
        controlsBox.add_child(this._nextBtn);
        controlsBox.add_child(this._durationLabel);
        this._actor.add_child(controlsBox);
    }

    setCapsuleSize(size) {
        if (!Object.hasOwn(CAPSULE_SIZES, size) || !this._actor) return;
        const preset = CAPSULE_SIZES[size];
        this._actor.style = `width: ${preset.width}px; padding: 8px 14px; spacing: 6px;`;
        this._artBox.style = `width: ${preset.artwork}px; height: ${preset.artwork}px; border-radius: 12px;`;
        this._artIcon.icon_size = preset.artwork;
        this._titleLabel.style = `font-size: ${preset.title}px; font-weight: bold;`;
        this._artistLabel.style = `font-size: ${preset.artist}px;`;
        for (const button of [this._prevBtn, this._nextBtn]) {
            button.style = `width: ${preset.button}px; height: ${preset.button}px; padding: 0; border-radius: 12px;`;
            button.get_child().icon_size = preset.icon;
        }
        this._playPauseBtn.style = `width: ${preset.play}px; height: ${preset.button}px; padding: 0; border-radius: 14px;`;
        this._playIcon.icon_size = preset.icon + 2;
    }

    setConnected(connected) {
        this._connected = Boolean(connected);
        if (!this._connected)
            this.setMedia(null);
    }

    setAnimationEnabled(enabled) {
        this._beatBars?.setAnimationEnabled(enabled);
    }

    setMedia(media) {
        this._progressMedia = this._connected ? media : null;
        this._renderProgress();
        this._syncProgressTimer();
        this._setArtwork(this._connected && media?.playerId ? media : null);
        const pres = formatMediaPresentation(this._connected ? media : null);
        this._beatBars?.setPlayback(pres.isPlaying, pres.hasPlayer, media?.audioLevels);
        if (this._titleLabel) {
            this._titleLabel.text = this._connected ? pres.title : 'Core offline';
        }
        if (this._artistLabel) {
            this._artistLabel.text = pres.artist;
            this._artistLabel.visible = pres.hasPlayer;
        }
        if (this._playPauseBtn) {
            this._playIcon.icon_name = pres.isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
            this._playPauseBtn.accessible_name = pres.isPlaying ? 'Pause' : 'Play';
            this._playPauseBtn.reactive = pres.canPlayPause;
            this._playPauseBtn.can_focus = pres.canPlayPause;
            this._playPauseBtn.opacity = pres.canPlayPause ? 255 : 102;
        }
        if (this._nextBtn) {
            this._nextBtn.reactive = pres.canNext;
            this._nextBtn.can_focus = pres.canNext;
            this._nextBtn.opacity = pres.canNext ? 255 : 102;
        }
        if (this._prevBtn) {
            this._prevBtn.reactive = pres.canPrevious;
            this._prevBtn.can_focus = pres.canPrevious;
            this._prevBtn.opacity = pres.canPrevious ? 255 : 102;
        }
    }

    _renderProgress() {
        if (!this._actor || !this._progressTrack) return;
        const timeline = estimateTimeline(this._progressMedia, this._clock());
        this._elapsedLabel.text = formatTime(timeline.positionUs);
        this._durationLabel.text = timeline.durationUs > 0 ? formatTime(timeline.durationUs) : '--:--';
        this._progressTrack.visible = timeline.durationUs > 0;
        this._progressFill.visible = timeline.progress > 0;
        this._progressFill.width = Math.round(Math.max(0, Number(this._progressTrack.width) || 0) * timeline.progress);
    }

    _syncProgressTimer() {
        const running = this._actor?.mapped && this._progressMedia?.playbackStatus === 'Playing' &&
            Number(this._progressMedia.durationUs) > 0;
        if (running && this._progressTimer === null)
            this._progressTimer = this._scheduler.repeat(() => this._renderProgress());
        else if (!running && this._progressTimer !== null) {
            this._scheduler.cancel(this._progressTimer);
            this._progressTimer = null;
        }
    }

    _setArtwork(media) {
        const uri = media?.albumArtUri ?? '';
        const key = JSON.stringify([media?.playerId, media?.title, uri]);
        if (key === this._artKey || !this._artIcon) return;
        this._artKey = key;
        const generation = ++this._artGeneration;
        this._artCancellable?.cancel();
        this._artCancellable = null;
        this._artIcon.gicon = null;
        this._artIcon.icon_name = 'audio-x-generic-symbolic';
        if (!uri || !Gio) return;
        this._artCancellable = new Gio.Cancellable();
        this._loadArtwork(uri, this._artCancellable).then(icon => {
            if (generation === this._artGeneration && this._artIcon && icon)
                this._artIcon.gicon = icon;
        }).catch(() => {});
    }

    destroy() {
        if (this._progressTimer !== null) this._scheduler.cancel(this._progressTimer);
        this._progressTimer = null;
        this._beatBars?.destroy();
        ++this._artGeneration;
        this._artCancellable?.cancel();
        this._artCancellable = null;
        this._artIcon = null;
        if (this._actor) {
            try {
                this._actor.destroy();
            } catch (_) {}
            this._actor = null;
        }
        this._titleLabel = null;
        this._artistLabel = null;
        this._playPauseBtn = null;
        this._nextBtn = null;
        this._prevBtn = null;
    }
}
