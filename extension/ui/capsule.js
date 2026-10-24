// GNOME Shell actor: no D-Bus or external process dependencies in the M0 spike.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {MediaView} from './mediaView.js';

export class Capsule {
    constructor({onControlAction, onInteractionEvent} = {}) {
        this._onInteractionEvent = onInteractionEvent ?? (() => {});

        this._button = new PanelMenu.Button(0, 'Linux Island', false);
        this._button.add_style_class_name('linux-island');

        this._container = new St.BoxLayout({
            style_class: 'linux-island__capsule',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });

        this._label = new St.Label({
            text: 'Island',
            style_class: 'linux-island__label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._container.add_child(this._label);

        this._mediaView = new MediaView({
            onControlAction,
        });

        this._button.add_child(this._container);

        this._container.connect('notify::hover', () => {
            const isHovered = this._container.hover;
            this._onInteractionEvent(isHovered ? 'HOVER_ENTER' : 'HOVER_LEAVE');
        });

        this._button.connect('button-press-event', () => {
            this._onInteractionEvent('CLICK');
            return Clutter.EVENT_PROPAGATE;
        });

        this._button.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._onInteractionEvent('DISMISS');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    mount() {
        Main.panel.addToStatusArea('linux-island', this._button, 0, 'center');
    }

    setVisible(visible) {
        if (this._button)
            this._button.visible = Boolean(visible);
    }

    applyState(state) {
        if (!this._container)
            return;

        if (state === 'HIDDEN') {
            this.setVisible(false);
            return;
        }

        this.setVisible(true);
        this._container.remove_style_class_name('linux-island__preview');
        this._container.remove_style_class_name('linux-island__capsule');

        if (state === 'PREVIEW' || state === 'EXPANDED' || state === 'PEEK') {
            this._container.add_style_class_name('linux-island__preview');
        } else {
            this._container.add_style_class_name('linux-island__capsule');
        }
    }

    setMedia(media) {
        this._mediaView?.setMedia(media);
    }

    destroy() {
        this._mediaView?.destroy();
        this._mediaView = null;
        this._button?.destroy();
        this._button = null;
        this._container = null;
        this._label = null;
    }
}
