// GNOME Shell 46 (ES module); must be tested in a disposable GNOME session.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Capsule} from './ui/capsule.js';

export default class LinuxIslandExtension extends Extension {
    enable() {
        if (this._capsule)
            return;
        const capsule = new Capsule();
        try {
            capsule.mount();
            this._capsule = capsule;
        } catch (error) {
            capsule.destroy();
            throw error;
        }
    }

    disable() {
        this._capsule?.destroy();
        this._capsule = null;
    }
}
