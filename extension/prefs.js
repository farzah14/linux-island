import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

export default class LinuxIslandPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        try {
            Gio.Subprocess.new(['linux-island-settings'], Gio.SubprocessFlags.NONE);
        } catch (_) {}

        const page = new Adw.PreferencesPage({
            title: 'Linux Island',
            icon_name: 'preferences-system-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Screen & Notch Alignment',
            description: 'Linux Island settings are managed in the dedicated Settings app.',
        });
        const row = new Adw.ActionRow({
            title: 'Open Linux Island Settings',
            subtitle: 'Configure vertical/horizontal offsets, appearance, and media preferences',
        });
        const btn = new Gtk.Button({
            label: 'Open Settings',
            valign: Gtk.Align.CENTER,
        });
        btn.connect('clicked', () => {
            try {
                Gio.Subprocess.new(['linux-island-settings'], Gio.SubprocessFlags.NONE);
            } catch (_) {}
        });
        row.add_suffix(btn);
        row.set_activatable_widget(btn);
        group.add(row);
        page.add(group);
        window.add(page);
    }
}
