// GNOME Shell 46 (ES module); must be tested in a disposable GNOME session.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Capsule} from './ui/capsule.js';
import {GnomeDisplayAdapter} from './lib/gnomeDisplayAdapter.js';
import {IslandController} from './lib/islandController.js';
import {CoreProxy} from './lib/coreProxy.js';
import {TimeProxy} from './lib/timeProxy.js';
import {NotificationAdapter} from './lib/notificationAdapter.js';
export default class LinuxIslandExtension extends Extension {
    enable() {
        if (this._capsule)
            return;

        const capsule = new Capsule({
            onControlAction: action => this._coreProxy?.controlMedia(action),
            onInteractionEvent: event => this._controller?.dispatch(event),
            onMediaOpen: () => this._coreProxy?.refreshMedia(),
            onUpdateSettings: patch => this._coreProxy?.updateSettings(patch),
            onSetActivePlayer: id => this._coreProxy?.setActivePlayer(id),
            onWhatsAppActivate: () => this._notifAdapter?.activateWhatsApp(),
            onStartTimer: request => this._timeProxy?.startTimer(request),
            onControlTimer: action => this._timeProxy?.controlTimer(action),
            onTimerStats: () => this._timeProxy?.fetchStats(),
        });
        let controller = null;
        let coreProxy = null;
        let timeProxy = null;

        try {
            capsule.mount();
            this._capsule = capsule;
            capsule.setConnected(false);

            const adapter = new GnomeDisplayAdapter({
                display: typeof global !== 'undefined' ? global.display : null,
                workspaceManager: typeof global !== 'undefined' ? global.workspace_manager : null,
                layoutManager: typeof Main !== 'undefined' ? Main.layoutManager : null,
            });

            controller = new IslandController({
                adapter,
                onStateChanged: state => {
                    this._capsule?.applyState(state);
                },
            });
            this._controller = controller;
            this._capsule.applyState(this._controller.state);

            coreProxy = new CoreProxy({
                onStateChanged: coreState => {
                    this._onCoreStateChanged(coreState);
                },
                onPlayersChanged: players => {
                    this._capsule?.setAvailablePlayers(players);
                },
            });
            this._coreProxy = coreProxy;

            timeProxy = new TimeProxy({
                onStateChanged: state => this._onTimeStateChanged(state),
                onTimerFinished: () => this._controller?.dispatch('PEEK_REQUEST'),
                onPhaseChanged: () => this._controller?.dispatch('PEEK_REQUEST'),
            });
            this._timeProxy = timeProxy;

            this._notifAdapter = new NotificationAdapter({
                enabled: false,
                whatsappEnabled: false,
                onNotificationPeek: () => {
                    this._controller?.dispatch('PEEK_REQUEST');
                },
                onWhatsAppActivityChanged: hasActivity => {
                    this._capsule?.setWhatsAppActivity(hasActivity);
                },
            });
        } catch (error) {
            this._notifAdapter?.destroy();
            this._notifAdapter = null;
            timeProxy?.destroy();
            coreProxy?.destroy();
            controller?.destroy();
            capsule.destroy();
            this._coreProxy = null;
            this._timeProxy = null;
            this._controller = null;
            this._capsule = null;
            throw error;
        }
    }

    _onCoreStateChanged(coreState) {
        this._lastSettings = coreState?.settings ?? this._lastSettings ?? {};
        this._capsule?.setConnected(Boolean(coreState?.connected));
        if (coreState?.media) {
            this._capsule?.setMedia(coreState.media);
        }
        if (coreState?.settings) {
            this._controller?.setFullscreenPolicyEnabled(coreState.settings.smartAdaptiveEnabled);
            this._capsule?.setHoverPreviewEnabled(coreState.settings.hoverPreviewEnabled);
            this._capsule?.setTheme(coreState.settings.theme);
            this._capsule?.setCapsuleSize(coreState.settings.capsuleSize);
            this._capsule?.setDisplayMode(coreState.settings.displayMode);
            this._capsule?.setAnimationEnabled(coreState.settings.animationEnabled);
            if (coreState.settings.verticalOffset !== undefined) {
                this._capsule?.setVerticalOffset(coreState.settings.verticalOffset);
            }
            if (coreState.settings.horizontalOffset !== undefined) {
                this._capsule?.setHorizontalOffset(coreState.settings.horizontalOffset);
            }
            const peekEnabled = Boolean(coreState.settings.notificationPeekEnabled);
            this._notifAdapter?.setEnabled(peekEnabled);
            const waEnabled = Boolean(coreState.settings.whatsappIntegrationEnabled);
            this._notifAdapter?.setWhatsAppEnabled(waEnabled);
            this._capsule?.setWhatsAppEnabled(waEnabled);
        }
    }
    _onTimeStateChanged(state) {
        this._capsule?.setTimer(state.timer);
        if (state.stats)
            this._capsule?.setTimerStats(state.stats);
    }

    disable() {
        this._notifAdapter?.destroy();
        this._notifAdapter = null;

        this._timeProxy?.destroy();
        this._timeProxy = null;
        this._coreProxy?.destroy();
        this._coreProxy = null;
        this._controller?.destroy();
        this._controller = null;

        this._capsule?.destroy();
        this._capsule = null;
    }
}
