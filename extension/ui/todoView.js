// Shared task list, owned by the Core service. All D-Bus calls are asynchronous.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

export class TodoSection {
    constructor() {
        this._proxy = null;
        this._generation = 0;
        this._destroyed = false;
        this.actor = new St.BoxLayout({vertical: true, x_expand: true, style: 'spacing: 4px;'});
        const row = new St.BoxLayout({x_expand: true, style: 'spacing: 4px;'});
        this._entry = new St.Entry({hint_text: 'New task', can_focus: true, x_expand: true});
        row.add_child(this._entry);
        const add = new St.Button({label: 'Add', can_focus: true, style_class: 'linux-island__shelf-chip'});
        add.connect('clicked', () => this._add());
        this._entry.clutter_text.connect('activate', () => this._add());
        row.add_child(add);
        this.actor.add_child(row);
        this._status = new St.Label({text: 'Connecting…', style_class: 'linux-island__shelf-meta'});
        this.actor.add_child(this._status);
        const scroll = new St.ScrollView({style: 'height: 80px;', x_expand: true});
        this._list = new St.BoxLayout({vertical: true, x_expand: true, style: 'spacing: 3px;'});
        scroll.add_child(this._list);
        this.actor.add_child(scroll);
        Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
            'io.github.linuxisland.Core', '/io/github/linuxisland/Core', 'io.github.linuxisland.Todo1',
            null, (_source, result) => {
                if (this._destroyed) return;
                try {
                    this._proxy = Gio.DBusProxy.new_for_bus_finish(result);
                    this._proxy.connect('g-signal', (_p, _sender, name, params) => {
                        if (name === 'Changed') { this._generation++; this._render(params.deepUnpack()[0]); }
                    });
                    this._proxy.connect('notify::g-name-owner', () => { this._generation++; this.refresh(); });
                    this.refresh();
                } catch (_) { this._status.text = 'To-do service unavailable'; }
            });
    }
    _call(method, args, callback) {
        if (!this._proxy?.g_name_owner) { this._status.text = 'To-do service unavailable'; return; }
        this._proxy.call(method, args, Gio.DBusCallFlags.NONE, -1, null, (proxy, result) => {
            if (this._destroyed) return;
            try { callback?.(proxy.call_finish(result).deepUnpack()[0]); }
            catch (_) { this._status.text = 'Could not update tasks'; }
        });
    }
    refresh() {
        const generation = this._generation;
        this._call('GetTasks', null, json => { if (generation === this._generation) this._render(json); });
    }
    _add() {
        const text = this._entry.get_text().trim();
        if (!text) return;
        this._call('AddTask', new GLib.Variant('(s)', [text]), ok => {
            if (ok) this._entry.set_text(''); else this._status.text = 'Could not add task';
        });
    }
    _render(json) {
        let items;
        try { items = JSON.parse(json); if (!Array.isArray(items)) throw new Error(); }
        catch (_) { this._status.text = 'Could not read tasks'; return; }
        this._list.destroy_all_children();
        this._status.text = items.length ? `${items.filter(i => !i.done).length} remaining` : 'No tasks yet';
        for (const item of items) {
            if (item.done) continue;
            const row = new St.BoxLayout({x_expand: true, style: 'spacing: 5px;'});
            const toggle = new St.Button({label: item.done ? '☑' : '☐', can_focus: true, accessible_name: item.done ? 'Mark incomplete' : 'Mark complete'});
            toggle.connect('clicked', () => this._call('SetDone', new GLib.Variant('(sb)', [item.id, !item.done]), ok => { if (!ok) this._status.text = 'Could not update task'; }));
            row.add_child(toggle);
            const label = new St.Label({text: item.title, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
            label.clutter_text.ellipsize = 3;
            row.add_child(label);
            const remove = new St.Button({label: '×', can_focus: true, accessible_name: 'Delete task'});
            remove.connect('clicked', () => this._call('RemoveTask', new GLib.Variant('(s)', [item.id]), ok => { if (!ok) this._status.text = 'Could not delete task'; }));
            row.add_child(remove);
            this._list.add_child(row);
        }
    }
    setWidth(width) { this.actor.width = Math.max(0, width); }
    destroy() { this._destroyed = true; this.actor.destroy(); this._proxy = null; }
}
