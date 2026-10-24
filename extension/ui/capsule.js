// GNOME Shell actor: no D-Bus or external process dependencies in the M0 spike.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

export class Capsule {
    constructor() {
        this._button = new PanelMenu.Button(0, 'Linux Island', false);
        const container = new St.BoxLayout({
            style: 'background-color: #202124; border-radius: 16px; padding: 0 12px;',
        });
        container.add_child(new St.Label({
            text: 'Island',
            style: 'color: #ffffff; font-weight: 600;',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._button.add_child(container);
    }

    mount() {
        Main.panel.addToStatusArea('linux-island', this._button, 0, 'center');
    }

    destroy() {
        this._button?.destroy();
        this._button = null;
    }
}
