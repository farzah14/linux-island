import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

// Resolve the Settings binary first: PATH lookup finds system packages, the
// ~/.local/bin fallback covers per-user installs.
function openSettings() {
    const attempts = [];
    const found = GLib.find_program_in_path('linux-island-settings');
    if (found)
        attempts.push([found]);
    attempts.push(['linux-island-settings']);
    attempts.push([`${GLib.get_home_dir()}/.local/bin/linux-island-settings`]);

    for (const argv of attempts) {
        try {
            Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            return;
        } catch (_) {}
    }
}

export default class LinuxIslandPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
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
        btn.connect('clicked', () => openSettings());
        row.add_suffix(btn);
        row.set_activatable_widget(btn);
        group.add(row);
        page.add(group);
        window.add(page);
    }
}
