// GNOME Shell 46 (ES module); must be tested in a disposable GNOME session.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Capsule} from './ui/capsule.js';
import {GnomeDisplayAdapter} from './lib/gnomeDisplayAdapter.js';
import {IslandController} from './lib/islandController.js';
import {CoreProxy} from './lib/coreProxy.js';
import {NotificationAdapter} from './lib/notificationAdapter.js';
export default class LinuxIslandExtension extends Extension {
    enable() {
        if (this._capsule)
            return;

        const capsule = new Capsule({
            onControlAction: action => this._coreProxy?.controlMedia(action),
            onInteractionEvent: event => this._controller?.dispatch(event),
        });
        let controller = null;
        let coreProxy = null;

        try {
            capsule.mount();
            this._capsule = capsule;

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
            });
            this._coreProxy = coreProxy;

            this._notifAdapter = new NotificationAdapter({
                enabled: false,
                onNotificationPeek: () => {
                    this._controller?.dispatch('PEEK_REQUEST');
                },
            });
        } catch (error) {
            this._notifAdapter?.destroy();
            this._notifAdapter = null;
            coreProxy?.destroy();
            controller?.destroy();
            capsule.destroy();
            this._coreProxy = null;
            this._controller = null;
            this._capsule = null;
            throw error;
        }
    }

    _onCoreStateChanged(coreState) {
        if (coreState?.media) {
            this._capsule?.setMedia(coreState.media);
        }
        if (coreState?.settings) {
            const peekEnabled = Boolean(coreState.settings.notificationPeekEnabled);
            this._notifAdapter?.setEnabled(peekEnabled);
        }
    }

    disable() {
        this._notifAdapter?.destroy();
        this._notifAdapter = null;

        this._coreProxy?.destroy();
        this._coreProxy = null;
        this._controller?.destroy();
        this._controller = null;

        this._capsule?.destroy();
        this._capsule = null;
    }
}
