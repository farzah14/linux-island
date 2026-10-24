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
     * @param {Function} [options.onDismiss] - () => void
     */
    constructor({onControlAction, onDismiss} = {}) {
        this._onControlAction = onControlAction ?? (() => {});
        this._onDismiss = onDismiss ?? (() => {});
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
            style: 'width: 330px; padding: 12px 14px 14px 14px; spacing: 8px;',
            reactive: true,
        });

        // Top mini-bar: "🏝️ Linux Island" + spacer + close button "✕"
        const topBar = new St.BoxLayout({
            style: 'spacing: 8px;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const brandLabel = new St.Label({
            text: '🏝️ Linux Island',
            style: 'font-size: 11px; font-weight: 600; color: #A69C8F;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const topSpacer = new St.Widget({
            x_expand: true,
        });

        const closeBtn = new St.Button({
            label: '✕',
            style: 'padding: 2px 8px; border-radius: 8px; background-color: #23211E; color: #A69C8F; font-size: 11px;',
            reactive: true,
            can_focus: true,
        });
        closeBtn.connect('clicked', () => this._onDismiss());

        topBar.add_child(brandLabel);
        topBar.add_child(topSpacer);
        topBar.add_child(closeBtn);
        this._actor.add_child(topBar);

        // Track info row: Album art box on left, Title + Artist on right
        const trackRow = new St.BoxLayout({
            style: 'spacing: 12px; padding: 4px 0;',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const artBox = new St.BoxLayout({
            style: 'width: 44px; height: 44px; border-radius: 10px; background-color: #23211E; border: 1px solid #403B34;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const artIcon = new St.Label({
            text: '🎵',
            style: 'font-size: 18px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        artBox.add_child(artIcon);
        trackRow.add_child(artBox);

        const textCol = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 2px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._titleLabel = new St.Label({
            text: 'No Media Playing',
            style: 'font-size: 14px; font-weight: bold; color: #F4F0E9;',
        });
        if (this._titleLabel.clutter_text) {
            this._titleLabel.clutter_text.set_ellipsize(3);
        }

        this._artistLabel = new St.Label({
            text: '',
            style: 'font-size: 12px; color: #D8B77F;',
        });
        if (this._artistLabel.clutter_text) {
            this._artistLabel.clutter_text.set_ellipsize(3);
        }

        textCol.add_child(this._titleLabel);
        textCol.add_child(this._artistLabel);
        trackRow.add_child(textCol);
        this._actor.add_child(trackRow);

        // Playback controls row: [  ⏮  ]   [   ▶   ]   [  ⏭  ]
        const controlsBox = new St.BoxLayout({
            style: 'spacing: 16px; padding-top: 8px;',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._prevBtn = new St.Button({
            label: '⏮',
            style: 'padding: 6px 18px; border-radius: 12px; background-color: #23211E; color: #F4F0E9; font-size: 15px;',
            reactive: true,
            can_focus: true,
        });
        this._prevBtn.connect('clicked', () => this._onControlAction('Previous'));

        this._playPauseBtn = new St.Button({
            label: '▶',
            style: 'padding: 8px 26px; border-radius: 14px; background-color: #D8B77F; color: #191816; font-size: 17px; font-weight: bold;',
            reactive: true,
            can_focus: true,
        });
        this._playPauseBtn.connect('clicked', () => this._onControlAction('PlayPause'));

        this._nextBtn = new St.Button({
            label: '⏭',
            style: 'padding: 6px 18px; border-radius: 12px; background-color: #23211E; color: #F4F0E9; font-size: 15px;',
            reactive: true,
            can_focus: true,
        });
        this._nextBtn.connect('clicked', () => this._onControlAction('Next'));

        controlsBox.add_child(this._prevBtn);
        controlsBox.add_child(this._playPauseBtn);
        controlsBox.add_child(this._nextBtn);
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
