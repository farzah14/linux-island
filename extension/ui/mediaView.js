// Media presentation mapper and GNOME Shell UI view.
// Pure mapper runs in Node.js and GJS; UI actors constructed when GJS St/Clutter are available.
import {loadLocalArtwork} from '../lib/localArtwork.js';
import {BeatBars} from './beatBars.js';
import {estimateTimeline, formatTime} from '../lib/mediaTimeline.js';
import {SystemMetricsRow, NetMonitorView, computeSystemColumns} from './systemMetricTile.js';
import {QuickTogglesRow} from './quickToggle.js';
import {FeatureCarousel} from './featureCarousel.js';
import {AiQuotaSection} from './aiQuotaView.js';
import {SearchSection} from './searchView.js';
import {DEFAULT_SEARCH_ENGINE, isValidNavigationUrl} from '../lib/searchEngines.js';

export const CAPSULE_SIZES = Object.freeze({
    circle: {width: 268, artwork: 40, button: 28, play: 36, icon: 12,
        title: 12, artist: 11, compactFont: 12, padding: '4px 12px', limit: 28},
    small: {width: 268, artwork: 40, button: 28, play: 36, icon: 12,
        title: 12, artist: 11, compactFont: 12, padding: '4px 12px', limit: 28},
    medium: {width: 328, artwork: 48, button: 32, play: 40, icon: 14,
        title: 13, artist: 12, compactFont: 13, padding: '6px 18px', limit: 36},
    large: {width: 388, artwork: 56, button: 36, play: 44, icon: 16,
        title: 14, artist: 13, compactFont: 14, padding: '8px 22px', limit: 44},
});

// The media page stacks four rows: artwork, progress track, transport and
// volume. Its height must include the volume row, otherwise the carousel's
// clip_to_allocation cuts it off.
export const MEDIA_ROW_SPACING = 4;
export const VOLUME_ROW_HEIGHT = 28;
export function mediaSectionHeight(preset) {
    return preset.artwork + 6 + preset.button + VOLUME_ROW_HEIGHT + MEDIA_ROW_SPACING * 3;
}

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
function formatPlayerName(playerId) {
    if (!playerId) return 'Player';
    const prefix = 'org.mpris.MediaPlayer2.';
    if (playerId.startsWith(prefix)) {
        const name = playerId.slice(prefix.length).split('.')[0];
        if (name) return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return playerId;
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
            volume: 1.0,
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

    const volume = (typeof media?.volume === 'number' && !Number.isNaN(media.volume))
        ? Math.max(0, Math.min(1, media.volume)) : 1.0;

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
        volume,
    };
}

// Resolve the Settings binary before spawning it: on systems where only the
// system package is installed there is no ~/.local/bin copy to fall back to.
export function openSettingsApp() {
    const attempts = [];
    if (GLib?.find_program_in_path) {
        const found = GLib.find_program_in_path('linux-island-settings');
        if (found)
            attempts.push([found]);
    }
    attempts.push(['linux-island-settings']);
    if (GLib?.get_home_dir)
        attempts.push([`${GLib.get_home_dir()}/.local/bin/linux-island-settings`]);

    for (const argv of attempts) {
        try {
            if (Gio?.Subprocess)
                Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            return true;
        } catch (_) {}
    }
    return false;
}

export class MediaView {
    /**
     * @param {Object} [options]
     * @param {Function} [options.onControlAction] - (action: string) => void
     * @param {Function} [options.onDismiss] - () => void
     * @param {Function} [options.artworkLoader] - async validated local icon loader
     */
    constructor({onControlAction, onDismiss, onThemeToggle, onSetActivePlayer, onUpdateSettings,
        onCompanionStart, onCompanionEnd,
        searchEngine = DEFAULT_SEARCH_ENGINE, artworkLoader = loadLocalArtwork,
        clock = () => GLib ? GLib.get_monotonic_time() : 0, scheduler} = {}) {
        this._onControlAction = onControlAction ?? (() => {});
        this._onDismiss = onDismiss ?? (() => {});
        this._onThemeToggle = onThemeToggle ?? (() => {});
        this._onSetActivePlayer = onSetActivePlayer ?? (() => {});
        this._onUpdateSettings = onUpdateSettings ?? (() => {});
        this._onCompanionStart = onCompanionStart ?? (() => {});
        this._onCompanionEnd = onCompanionEnd ?? (() => {});
        this._companionSubprocess = null;
        this._searchEngine = searchEngine;
        this._availablePlayers = [];
        this._playerSwitcherBtn = null;
        this._playerSwitcherLabel = null;
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
        this._lastUserSeek = null;
        this._controlsBox = null;
        this._volumeButton = null;
        this._volumeTrack = null;
        this._volumeFill = null;
        this._volumeFraction = 1.0;
        this._lastUnmutedVolume = 1.0;
        this._lastUserVolume = null;
        this._scheduler = scheduler ?? {
            repeat: (fn, ms = 250) => GLib ? GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                fn(); return GLib.SOURCE_CONTINUE;
            }) : null,
            cancel: id => { if (GLib && id) GLib.source_remove(id); },
        };
        this._aiQuotaSection = null;
        this._searchSection = null;
        this._netView = null;
        this._metricsSlot = null;
        this._togglesSlot = null;
        this._mappedSignalId = null;

        if (St && Clutter) {
            this._buildUi();
            this._mappedSignalId = this._actor.connect('notify::mapped', () => {
                this._renderProgress();
                this._renderVolume();
                this._syncProgressTimer();
                if (!this._actor?.mapped) {
                    this._metricsRow?.stop();
                    this._aiQuotaSection?.stop();
                } else if (this._carousel?.activeIndex === 1) {
                    this._metricsRow?.start();
                } else if (this._carousel?.activeIndex === 2) {
                    this._aiQuotaSection?.start();
                }
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

        // Section 1: Pure Media Player section
        this._mediaSection = new St.BoxLayout({
            vertical: true,
            style: `width: 328px; height: ${mediaSectionHeight(CAPSULE_SIZES.medium)}px; spacing: ${MEDIA_ROW_SPACING}px;`,
            x_expand: true,
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

        const artistRow = new St.BoxLayout({style: 'spacing: 6px;', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        artistRow.add_child(this._artistLabel);

        this._playerSwitcherBtn = new St.Button({
            style_class: 'linux-island__player-badge',
            reactive: true,
            can_focus: true,
            visible: false,
            accessible_name: 'Switch active player',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._playerSwitcherLabel = new St.Label({
            text: 'Player ▾',
            style: 'font-size: 10px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._playerSwitcherBtn.set_child(this._playerSwitcherLabel);
        this._playerSwitcherBtn.connect('clicked', () => this._cyclePlayer());
        artistRow.add_child(this._playerSwitcherBtn);
        textCol.add_child(artistRow);

        trackRow.add_child(textCol);
        this._mediaSection.add_child(trackRow);

        this._progressTrack = new St.BoxLayout({
            style: 'height: 6px; border-radius: 3px;',
            style_class: 'linux-island__progress-track',
            x_expand: true,
            reactive: true,
            track_hover: true,
        });
        this._progressFill = new St.Widget({
            style: 'height: 6px; border-radius: 3px;',
            style_class: 'linux-island__progress-fill',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });
        this._progressFill.set_pivot_point(0, 0.5);
        this._progressTrack.add_child(this._progressFill);
        this._progressTrack.connect('notify::allocation', () => this._renderProgress());
        this._progressTrack.connect('button-press-event', (_actor, event) => {
            if (!this._progressMedia || !this._progressMedia.durationUs || this._progressMedia.durationUs <= 0) {
                return Clutter.EVENT_PROPAGATE;
            }
            if (this._progressMedia.canSeek === false) {
                return Clutter.EVENT_PROPAGATE;
            }
            let clickX = 0;
            if (typeof event.get_coords === 'function') {
                const [x, y] = event.get_coords();
                let transformed = false;
                if (typeof this._progressTrack.transform_stage_point === 'function') {
                    const res = this._progressTrack.transform_stage_point(x, y);
                    if (Array.isArray(res)) {
                        if (res.length === 3 && typeof res[0] === 'boolean') {
                            if (res[0]) {
                                clickX = res[1];
                                transformed = true;
                            }
                        } else if (res.length >= 2) {
                            clickX = res[0];
                            transformed = true;
                        }
                    }
                }
                if (!transformed) {
                    const [stageX] = this._progressTrack.get_transformed_position?.() ?? [0];
                    clickX = x - stageX;
                }
            }
            const width = this._progressTrack.width;
            if (width > 0) {
                const ratio = Math.max(0, Math.min(1, clickX / width));
                const targetUs = Math.round(ratio * this._progressMedia.durationUs);
                const now = this._clock();
                this._lastUserSeek = { targetUs, at: now };
                this._progressMedia = {
                    ...this._progressMedia,
                    positionUs: targetUs,
                    positionSampleUs: now,
                };
                this._renderProgress();
                this._onControlAction(`SeekTo:${targetUs}`);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._mediaSection.add_child(this._progressTrack);

        // Playback controls row: [ 0:19 ]   [  ⏮  ]   [   ▶   ]   [  ⏭  ]   [ 2:33 ]
        const controlsBox = new St.BoxLayout({
            style: 'spacing: 4px; height: 32px;',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._controlsBox = controlsBox;
        this._elapsedLabel = new St.Label({
            text: '0:00',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 10px; min-width: 36px;',
            style_class: 'linux-island__progress-time',
        });
        const leftSpacer = new St.Widget({x_expand: true});

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

        const centerButtons = new St.BoxLayout({
            style: 'spacing: 12px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        centerButtons.add_child(this._prevBtn);
        centerButtons.add_child(this._playPauseBtn);
        centerButtons.add_child(this._nextBtn);

        const rightSpacer = new St.Widget({x_expand: true});

        this._durationLabel = new St.Label({
            text: '--:--',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 10px; min-width: 36px; text-align: right;',
            style_class: 'linux-island__progress-time',
        });
        this._elapsedLabel.clutter_text?.set_ellipsize(3);
        this._durationLabel.clutter_text?.set_ellipsize(3);

        controlsBox.add_child(this._elapsedLabel);
        controlsBox.add_child(leftSpacer);
        controlsBox.add_child(centerButtons);
        controlsBox.add_child(rightSpacer);
        controlsBox.add_child(this._durationLabel);
        this._mediaSection.add_child(controlsBox);

        // Volume row: [ mute ] [ track ]
        const volumeRow = new St.BoxLayout({
            style: 'spacing: 8px; height: 28px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._volumeButton = new St.Button({
            style: 'width: 28px; height: 28px; padding: 0; border-radius: 12px;',
            style_class: 'linux-island__media-button',
            accessible_name: 'Mute',
            reactive: true,
            can_focus: true,
        });
        this._volumeIcon = new St.Icon({
            icon_name: 'audio-volume-high-symbolic',
            fallback_icon_name: 'audio-volume-high-symbolic',
            icon_size: 14,
        });
        this._volumeButton.set_child(this._volumeIcon);
        this._volumeButton.connect('clicked', () => this._toggleMute());
        volumeRow.add_child(this._volumeButton);

        this._volumeTrack = new St.BoxLayout({
            style: 'height: 6px; border-radius: 3px;',
            style_class: 'linux-island__volume-track',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        this._volumeFill = new St.Widget({
            style: 'height: 6px; border-radius: 3px;',
            style_class: 'linux-island__volume-fill',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });
        this._volumeFill.set_pivot_point(0, 0.5);
        this._volumeTrack.add_child(this._volumeFill);
        this._volumeTrack.connect('notify::allocation', () => this._renderVolume());
        this._volumeTrack.connect('button-press-event', (_actor, event) => {
            if (typeof event.get_button === 'function' && event.get_button() !== 1) {
                return Clutter.EVENT_PROPAGATE;
            }
            let clickX = 0;
            if (typeof event.get_coords === 'function') {
                const [x, y] = event.get_coords();
                let transformed = false;
                if (typeof this._volumeTrack.transform_stage_point === 'function') {
                    const res = this._volumeTrack.transform_stage_point(x, y);
                    if (Array.isArray(res)) {
                        if (res.length === 3 && typeof res[0] === 'boolean') {
                            if (res[0]) {
                                clickX = res[1];
                                transformed = true;
                            }
                        } else if (res.length >= 2) {
                            clickX = res[0];
                            transformed = true;
                        }
                    }
                }
                if (!transformed) {
                    const [stageX] = this._volumeTrack.get_transformed_position?.() ?? [0];
                    clickX = x - stageX;
                }
            }
            const width = this._volumeTrack.width;
            if (width > 0) {
                const ratio = Math.max(0, Math.min(1, clickX / width));
                this._volumeFraction = ratio;
                this._lastUserVolume = { at: this._clock() };
                this._renderVolume();
                this._onControlAction(`Volume:${ratio.toFixed(2)}`);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        volumeRow.add_child(this._volumeTrack);
        this._mediaSection.add_child(volumeRow);
        this._volumeRow = volumeRow;

        // Section 2: Pure System & Controls section (CPU, RAM, Battery on LEFT, and Icon Quick Controls on RIGHT)
        this._systemSection = new St.BoxLayout({
            vertical: false,
            style: 'width: 320px; height: 98px; spacing: 10px; padding: 0 4px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Three fixed-width slots: metrics | NET | right group (disk + icon
        // column). Equal side widths keep NET exactly on the page centre line.
        this._metricsSlot = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 0;',
            x_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._metricsRow = new SystemMetricsRow({
            scheduler: this._scheduler,
            onNetwork: network => this._netView?.setNetwork(network),
            onStorage: storage => this._quickTogglesRow?.setStorage(storage),
        });
        if (this._metricsRow.actor) {
            this._metricsSlot.add_child(this._metricsRow.actor);
        }
        this._systemSection.add_child(this._metricsSlot);

        // Centre slot: NET. No background, border or border-radius.
        this._netView = new NetMonitorView();
        if (this._netView.actor) {
            this._systemSection.add_child(this._netView.actor);
        }

        this._quickTogglesRow = new QuickTogglesRow({
            onThemeToggle: this._onThemeToggle,
            onOpenStorage: () => this._openStorageSettings(),
            onOpenSettings: () => {
                openSettingsApp();
                this._onDismiss?.();
            },
        });
        this._togglesSlot = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 0;',
            x_expand: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (this._quickTogglesRow.actor) {
            this._quickTogglesRow.actor.x_align = Clutter.ActorAlign.END;
            this._togglesSlot.add_child(this._quickTogglesRow.actor);
        }
        this._systemSection.add_child(this._togglesSlot);
        // Section 3: AI Quota Section (Antigravity, Codex, Claude Code)
        this._aiQuotaSection = new AiQuotaSection({scheduler: this._scheduler});
        if (this._aiQuotaSection.actor) {
            this._aiQuotaSection.setWidth(320);
        }

        // Section 4: Web Search
        this._searchSection = new SearchSection({
            engine: this._searchEngine,
            onEngineChanged: engine => this._onUpdateSettings({searchEngine: engine}),
            onSearch: url => this._openSearch(url),
            onDismiss: () => this._onDismiss?.(),
        });
        if (this._searchSection.actor) {
            this._searchSection.setWidth(320);
        }


        // Slideable Carousel between Music section and System/Controls section
        this._carousel = new FeatureCarousel({
            pages: [
                { id: 'media', actor: this._mediaSection, label: 'Music', iconName: 'audio-x-generic-symbolic' },
                {
                    id: 'system',
                    actor: this._systemSection,
                    label: 'System & Controls',
                    iconName: 'preferences-system-symbolic',
                    onActivate: () => this._metricsRow?.start(),
                },
                {
                    id: 'ai',
                    actor: this._aiQuotaSection?.actor,
                    label: 'AI Quota',
                    iconName: 'applications-science-symbolic',
                    onActivate: () => this._aiQuotaSection?.start(),
                },
                {
                    id: 'search',
                    actor: this._searchSection?.actor,
                    label: 'Search',
                    iconName: 'system-search-symbolic',
                    onActivate: () => this._searchSection?.focus(),
                },
            ],
            onPageChanged: (idx) => {
                if (idx === 1) {
                    this._metricsRow?.start();
                } else {
                    this._metricsRow?.stop();
                }
                if (idx === 2) {
                    this._aiQuotaSection?.start();
                } else {
                    this._aiQuotaSection?.stop();
                }
            },
        });
        if (this._carousel.actor) {
            this._actor.add_child(this._carousel.actor);
        }
    }

    setTheme(theme) {
        this._quickTogglesRow?.setTheme(theme);
    }

    setSearchEngine(engine) {
        this._searchSection?.setEngine(engine);
    }

    _cyclePlayer() {
        if (!this._availablePlayers || this._availablePlayers.length <= 1) return;
        const current = this._progressMedia?.playerId || '';
        let nextIdx = 0;
        const idx = this._availablePlayers.indexOf(current);
        if (idx >= 0) {
            nextIdx = (idx + 1) % this._availablePlayers.length;
        }
        const nextPlayer = this._availablePlayers[nextIdx];
        this._onSetActivePlayer(nextPlayer);
    }

    setAvailablePlayers(players) {
        this._availablePlayers = Array.isArray(players) ? [...players] : [];
        if (this._playerSwitcherBtn) {
            const hasMultiple = this._availablePlayers.length > 1;
            this._playerSwitcherBtn.visible = hasMultiple;
            if (hasMultiple) {
                const current = this._progressMedia?.playerId || '';
                const name = formatPlayerName(current);
                if (this._playerSwitcherLabel) {
                    this._playerSwitcherLabel.text = `${name} ▾`;
                }
            }
        }
    }

    _openStorageSettings() {
        // Prefer GNOME's Disk Usage analyser, then Settings' storage panel.
        const candidates = [
            ['gnome-disks'],
            ['baobab'],
            ['gnome-control-center', 'storage'],
        ];
        for (const argv of candidates) {
            try {
                if (!Gio) continue;
                Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
                return true;
            } catch (_) {
                // Try the next candidate
            }
        }
        return false;
    }

    setCapsuleSize(size) {
        if (!Object.hasOwn(CAPSULE_SIZES, size) || !this._actor) return;
        const preset = CAPSULE_SIZES[size];
        this._actor.style = `width: ${preset.width}px; padding: 8px 14px; spacing: 6px;`;
        // St's CSS width is the content box: the 14px horizontal padding is
        // added outside it. MediaView's own content box is therefore
        // preset.width, not preset.width - 28. The System page used to be
        // budgeted from the reduced value, so its right column stopped ~28px
        // short of the card edge (26px left margin vs 54px right).
        const contentWidth = preset.width;
        if (this._mediaSection) {
            this._mediaSection.style = `width: ${contentWidth}px; height: ${mediaSectionHeight(preset)}px; spacing: ${MEDIA_ROW_SPACING}px;`;
            this._mediaSection.width = contentWidth;
        }
        // The section's own 4px horizontal padding sits outside its CSS width,
        // so request contentWidth - 8 to make the outer box exactly contentWidth.
        // 8px is the section's horizontal padding (4px each side).
        const systemWidth = Math.max(0, contentWidth - 8);
        if (this._systemSection) {
            this._systemSection.style = `width: ${systemWidth}px; height: 98px; spacing: 10px; padding: 0 4px;`;
            this._systemSection.width = systemWidth;
        }
        const columns = computeSystemColumns(systemWidth);
        if (this._metricsSlot) {
            this._metricsSlot.style = `width: ${columns.metricsWidth}px; spacing: 0;`;
            this._metricsSlot.width = columns.metricsWidth;
        }
        if (this._metricsRow) this._metricsRow.setWidth(columns.metricsWidth);
        if (this._netView) this._netView.setWidth(columns.netWidth);
        if (this._togglesSlot) {
            this._togglesSlot.style = `width: ${columns.metricsWidth}px; spacing: 0;`;
            this._togglesSlot.width = columns.metricsWidth;
        }
        if (this._quickTogglesRow) {
            this._quickTogglesRow.setWidth(columns.metricsWidth);
        }
        if (this._aiQuotaSection) {
            // AI quota rows add their own 4px side padding, so subtract it from
            // the requested width to keep the page flush with the card.
            this._aiQuotaSection.setWidth(Math.max(0, contentWidth - 8));
        }
        this._searchSection?.setWidth(Math.max(0, contentWidth - 8));
        if (this._carousel) {
            this._carousel.setPageWidth?.(contentWidth);
        }
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
        if (this._controlsBox) {
            this._controlsBox.style = `spacing: 4px; height: ${preset.button}px;`;
        }
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
        if (!this._actor) return;
        const prevMedia = this._progressMedia;
        let effectiveMedia = this._connected ? media : null;

        if (this._lastUserSeek && effectiveMedia && prevMedia) {
            const sameTrack = (effectiveMedia.playerId === prevMedia.playerId &&
                               effectiveMedia.title === prevMedia.title);
            if (sameTrack) {
                const ageUs = this._clock() - this._lastUserSeek.at;
                if (ageUs < 1200000) {
                    const incomingPos = Number(effectiveMedia.positionUs) || 0;
                    const diffToTarget = Math.abs(incomingPos - this._lastUserSeek.targetUs);
                    if (diffToTarget > 1500000) {
                        effectiveMedia = {
                            ...effectiveMedia,
                            positionUs: this._lastUserSeek.targetUs,
                            positionSampleUs: this._lastUserSeek.at,
                        };
                    } else {
                        this._lastUserSeek = null;
                    }
                } else {
                    this._lastUserSeek = null;
                }
            } else {
                this._lastUserSeek = null;
            }
        } else if (!effectiveMedia) {
            this._lastUserSeek = null;
        }

        this._progressMedia = effectiveMedia;
        const pres = formatMediaPresentation(this._connected ? effectiveMedia : null);
        this._beatBars?.setPlayback(pres.isPlaying, pres.hasPlayer, effectiveMedia?.audioLevels);

        // Volume: keep the optimistic value while the core echo is still in
        // flight (the wpctl-only path emits no MPRIS PropertiesChanged), then
        // reconcile with whatever the core reports.
        const volumeAge = this._lastUserVolume?.at ? this._clock() - this._lastUserVolume.at : Infinity;
        if (this._lastUserVolume?.at && volumeAge < 1200000) {
            if (Math.abs(pres.volume - this._volumeFraction) < 0.005) {
                this._lastUserVolume = null;
            } else {
                this._lastUserVolume = { at: this._clock() };
            }
        } else {
            this._lastUserVolume = null;
            this._volumeFraction = pres.volume;
        }
        this._renderVolume();

        const trackChanged = (effectiveMedia?.playerId !== prevMedia?.playerId ||
            effectiveMedia?.title !== prevMedia?.title ||
            effectiveMedia?.artist !== prevMedia?.artist ||
            effectiveMedia?.albumArtUri !== prevMedia?.albumArtUri ||
            effectiveMedia?.playbackStatus !== prevMedia?.playbackStatus);
        // Position/capability updates also arrive without track metadata changes.
        this._renderProgress();
        this._syncProgressTimer();
        if (trackChanged || !prevMedia) {
            this._setArtwork(this._connected && effectiveMedia?.playerId ? effectiveMedia : null);
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
    }

    _renderProgress() {
        if (!this._actor || !this._progressTrack || !this._elapsedLabel || !this._durationLabel) return;
        try {
            const timeline = estimateTimeline(this._progressMedia, this._clock());
            if (this._elapsedLabel)
                this._elapsedLabel.text = formatTime(timeline.positionUs);
            if (this._durationLabel)
                this._durationLabel.text = timeline.durationUs > 0 ? formatTime(timeline.durationUs) : '--:--';
            this._progressTrack.visible = timeline.durationUs > 0;
            this._progressFill.visible = timeline.progress > 0;
            const targetWidth = Math.round(Math.max(0, Number(this._progressTrack.width) || 0) * timeline.progress);
            const enableAnim = St?.Settings?.get()?.enable_animations !== false;
            if (enableAnim && typeof this._progressFill.ease === 'function' && this._actor?.mapped) {
                this._progressFill.remove_all_transitions();
                this._progressFill.ease({
                    width: targetWidth,
                    duration: 250,
                    mode: Clutter?.AnimationMode?.LINEAR ?? 1,
                });
            } else {
                this._progressFill.width = targetWidth;
            }
        } catch (_) {}
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

    _renderVolume() {
        if (!this._volumeTrack || !this._volumeFill) return;
        try {
            const fraction = Math.max(0, Math.min(1, Number(this._volumeFraction) || 0));
            // Icon and accessibility state need no theme node, so they stay
            // correct even while the card is still off-stage.
            if (this._volumeIcon) {
                const muted = fraction <= 0;
                this._volumeIcon.icon_name = muted
                    ? 'audio-volume-muted-symbolic' : 'audio-volume-high-symbolic';
                this._volumeIcon.fallback_icon_name = this._volumeIcon.icon_name;
                if (this._volumeButton)
                    this._volumeButton.accessible_name = muted ? 'Unmute' : 'Mute';
            }
            // Reading .width or easing before the actor is in the stage makes
            // St log st_widget_get_theme_node criticals; the notify::mapped
            // handler re-runs this render once the card appears.
            if (!this._actor?.mapped) return;
            const targetWidth = Math.round(Math.max(0, Number(this._volumeTrack.width) || 0) * fraction);
            const enableAnim = St?.Settings?.get()?.enable_animations !== false;
            if (enableAnim && typeof this._volumeFill.ease === 'function') {
                this._volumeFill.remove_all_transitions();
                this._volumeFill.ease({
                    width: targetWidth,
                    duration: 150,
                    mode: Clutter?.AnimationMode?.EASE_OUT_CUBIC ?? 1,
                });
            } else {
                this._volumeFill.width = targetWidth;
            }
        } catch (_) {}
    }

    _toggleMute() {
        if (this._volumeFraction > 0) {
            this._lastUnmutedVolume = this._volumeFraction;
            this._volumeFraction = 0;
            this._lastUserVolume = { at: this._clock() };
            this._renderVolume();
            this._onControlAction('Volume:0.00');
        } else {
            const restore = this._lastUnmutedVolume <= 0 ? 1.0 : this._lastUnmutedVolume;
            this._volumeFraction = restore;
            this._lastUserVolume = { at: this._clock() };
            this._renderVolume();
            this._onControlAction(`Volume:${restore.toFixed(2)}`);
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
            if (generation === this._artGeneration && this._artIcon && icon) {
                this._artIcon.icon_name = null;
                this._artIcon.gicon = icon;
                this._artIcon.visible = true;
            }
        }).catch(() => {});
    }
    _openSearch(url) {
        // Only real web pages may reach the companion or the default browser.
        // SearchSection validates too, but MediaView is also called directly
        // by other callers, so the check must live at the launch boundary.
        if (!isValidNavigationUrl(url)) return;
        let launchedCompanion = false;
        if (typeof Gio !== 'undefined' && Gio?.Subprocess) {
            try {
                const home = GLib?.get_home_dir ? GLib.get_home_dir() : '';
                const candidates = [
                    home + '/.local/libexec/linux-island-ui',
                    '/usr/libexec/linux-island-ui',
                    '/app/libexec/linux-island-ui',
                    'linux-island-ui',
                    'linux-island-launch',
                ];
                let bin = 'linux-island-ui';
                if (GLib?.find_program_in_path) {
                    for (const cand of candidates) {
                        if (GLib.find_program_in_path(cand)) {
                            bin = cand;
                            break;
                        }
                    }
                }
                // A second search must replace the first companion window,
                // not stack another WebEngine process on top of it.
                const previous = this._companionSubprocess;
                if (previous) {
                    try {
                        previous.send_signal(15);
                    } catch (_) {
                        try {
                            previous.force_exit();
                        } catch (_) {}
                    }
                }
                const proc = new Gio.Subprocess({
                    argv: [bin, '--companion', url],
                    flags: Gio.SubprocessFlags.NONE,
                });
                proc.init(null);
                this._companionSubprocess = proc;
                launchedCompanion = true;
                // onCompanionStart dismisses the capsule; calling onDismiss
                // here as well dispatched a duplicate 'DISMISS'.
                this._onCompanionStart?.();
                proc.wait_async(null, (_p, res) => {
                    try {
                        proc.wait_finish(res);
                    } catch (_) {}
                    // The replaced process exits after the new one is already
                    // installed; clearing state here would orphan it.
                    if (this._companionSubprocess !== proc) return;
                    this._companionSubprocess = null;
                    this._onCompanionEnd?.();
                    // A companion that died on startup (missing WebEngine,
                    // broken profile) must not swallow the search: hand the
                    // URL to the default browser instead of failing silently.
                    if (typeof proc.get_if_exited === 'function' && proc.get_if_exited() &&
                        typeof proc.get_exit_status === 'function' && proc.get_exit_status() !== 0) {
                        try {
                            Gio?.AppInfo?.launch_default_for_uri(url, null);
                        } catch (_) {}
                    }
                });
            } catch (_) {}
        }
        if (!launchedCompanion) {
            try {
                Gio?.AppInfo?.launch_default_for_uri(url, null);
            } catch (_) {}
            this._onDismiss?.();
        }
    }


    destroy() {
        if (this._progressTimer !== null) this._scheduler.cancel(this._progressTimer);
        this._progressTimer = null;
        this._beatBars?.destroy();
        this._carousel?.destroy();
        this._carousel = null;
        this._metricsRow?.destroy();
        this._metricsRow = null;
        this._metricsSlot = null;
        this._netView?.destroy();
        this._netView = null;
        this._quickTogglesRow?.destroy();
        this._quickTogglesRow = null;
        this._togglesSlot = null;
        this._aiQuotaSection?.destroy();
        this._aiQuotaSection = null;
        this._searchSection?.destroy();
        this._searchSection = null;
        if (this._companionSubprocess) {
            try {
                // SIGTERM (not force_exit/SIGKILL) lets WebEngine flush its
                // cookie store, so the user's logins survive the Island
                // reloading its own UI.
                this._companionSubprocess.send_signal(15);
            } catch (_) {
                try {
                    this._companionSubprocess.force_exit();
                } catch (_) {}
            }
            this._companionSubprocess = null;
        }
        this._playerSwitcherBtn = null;
        this._playerSwitcherLabel = null;
        ++this._artGeneration;
        this._artCancellable?.cancel();
        this._artCancellable = null;
        this._artIcon = null;
        if (this._actor) {
            if (this._mappedSignalId !== null) {
                try {
                    this._actor.disconnect(this._mappedSignalId);
                } catch (_) {}
                this._mappedSignalId = null;
            }
            try {
                this._actor.destroy();
            } catch (_) {}
            this._actor = null;
        }
        this._elapsedLabel = null;
        this._durationLabel = null;
        this._progressTrack = null;
        this._progressFill = null;
        this._volumeButton = null;
        this._volumeIcon = null;
        this._volumeTrack = null;
        this._volumeFill = null;
        this._volumeRow = null;
        this._lastUserVolume = null;
        this._titleLabel = null;
        this._artistLabel = null;
        this._playPauseBtn = null;
        this._nextBtn = null;
        this._prevBtn = null;
        this._controlsBox = null;
    }
}
