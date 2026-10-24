// Media presentation mapper and GNOME Shell UI view.
// Pure mapper runs in Node.js and GJS; UI actors constructed when GJS St/Clutter are available.

let St = null;
let Clutter = null;
if (typeof process === 'undefined') {
    try {
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
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
     */
    constructor({onControlAction} = {}) {
        this._onControlAction = onControlAction ?? (() => {});
        this._actor = null;
        this._titleLabel = null;
        this._artistLabel = null;
        this._playPauseBtn = null;
        this._nextBtn = null;
        this._prevBtn = null;

        if (St && Clutter) {
            this._buildUi();
        }
    }

    get actor() {
        return this._actor;
    }

    _buildUi() {
        this._actor = new St.BoxLayout({
            vertical: true,
            style: 'padding: 8px 12px; spacing: 4px;',
        });

        this._titleLabel = new St.Label({
            text: 'No Media Playing',
            style: 'font-weight: bold; color: #FFFFFF;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._artistLabel = new St.Label({
            text: '',
            style: 'color: #D8B77F; font-size: 11px;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const controlsBox = new St.BoxLayout({
            style: 'spacing: 8px; padding-top: 4px;',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._prevBtn = new St.Button({
            label: '⏮',
            reactive: true,
            can_focus: true,
        });
        this._prevBtn.connect('clicked', () => this._onControlAction('Previous'));

        this._playPauseBtn = new St.Button({
            label: '▶',
            reactive: true,
            can_focus: true,
        });
        this._playPauseBtn.connect('clicked', () => this._onControlAction('PlayPause'));

        this._nextBtn = new St.Button({
            label: '⏭',
            reactive: true,
            can_focus: true,
        });
        this._nextBtn.connect('clicked', () => this._onControlAction('Next'));

        controlsBox.add_child(this._prevBtn);
        controlsBox.add_child(this._playPauseBtn);
        controlsBox.add_child(this._nextBtn);

        this._actor.add_child(this._titleLabel);
        this._actor.add_child(this._artistLabel);
        this._actor.add_child(controlsBox);
    }

    setMedia(media) {
        const pres = formatMediaPresentation(media);
        if (this._titleLabel) {
            this._titleLabel.text = pres.title;
        }
        if (this._artistLabel) {
            this._artistLabel.text = pres.artist;
            this._artistLabel.visible = pres.hasPlayer;
        }
        if (this._playPauseBtn) {
            this._playPauseBtn.label = pres.isPlaying ? '⏸' : '▶';
            this._playPauseBtn.reactive = pres.canPlayPause;
        }
        if (this._nextBtn) {
            this._nextBtn.reactive = pres.canNext;
        }
        if (this._prevBtn) {
            this._prevBtn.reactive = pres.canPrevious;
        }
    }

    destroy() {
        this._actor?.destroy();
        this._actor = null;
        this._titleLabel = null;
        this._artistLabel = null;
        this._playPauseBtn = null;
        this._nextBtn = null;
        this._prevBtn = null;
    }
}
