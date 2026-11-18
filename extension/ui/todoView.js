// Shared task list, owned by the Core service. All D-Bus calls are asynchronous.
let Gio = null;
let GLib = null;
let St = null;
let Clutter = null;
if (typeof process === 'undefined') {
    try {
        Gio = (await import('gi://Gio')).default;
        GLib = (await import('gi://GLib')).default;
        St = (await import('gi://St')).default;
        Clutter = (await import('gi://Clutter')).default;
    } catch (_) {}
}

export class TodoSection {
    constructor() {
        this._proxy = null;
        this._generation = 0;
        this._destroyed = false;
        this.actor = null;
        if (!St || !Clutter || !Gio) return;
        this.actor = new St.BoxLayout({vertical: true, x_expand: true, style: 'spacing: 5px;'});
        const row = new St.BoxLayout({x_expand: true, style: 'spacing: 6px;', y_align: Clutter.ActorAlign.CENTER});
        this._entry = new St.Entry({hint_text: 'Add a task...', can_focus: true, x_expand: true, style_class: 'linux-island__todo-input'});
        row.add_child(this._entry);
        const add = new St.Button({label: '+', can_focus: true, style_class: 'linux-island__todo-add', accessible_name: 'Add task', y_align: Clutter.ActorAlign.CENTER});
        add.connect('clicked', () => this._add());
        this._entry.clutter_text.connect('activate', () => this._add());
        row.add_child(add);
        this.actor.add_child(row);
        const scroll = new St.ScrollView({style: 'height: 82px;', x_expand: true});
        this._list = new St.BoxLayout({vertical: true, x_expand: true, style: 'spacing: 4px;'});
        scroll.add_child(this._list);
        this.actor.add_child(scroll);
        this._status = new St.Label({text: 'Connecting…', style_class: 'linux-island__todo-meta', visible: false});
        this.actor.add_child(this._status);
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
        this._status.visible = items.length === 0;
        for (const item of items) {
            const row = new St.BoxLayout({x_expand: true, style: 'spacing: 8px;', style_class: 'linux-island__todo-row', y_align: Clutter.ActorAlign.CENTER});
            const toggle = new St.Button({
                label: item.done ? '✓' : '',
                can_focus: true,
                style_class: item.done ? 'linux-island__todo-check--done' : 'linux-island__todo-check',
                accessible_name: item.done ? 'Mark incomplete' : 'Mark complete',
                y_align: Clutter.ActorAlign.CENTER,
            });
            toggle.connect('clicked', () => this._call('SetDone', new GLib.Variant('(sb)', [item.id, !item.done]), ok => { if (!ok) this._status.text = 'Could not update task'; }));
            row.add_child(toggle);
            const label = new St.Label({text: item.title, x_expand: true, style_class: item.done ? 'linux-island__todo-meta' : 'linux-island__todo-name', y_align: Clutter.ActorAlign.CENTER});
            label.clutter_text.ellipsize = 3;
            row.add_child(label);
            const remove = new St.Button({label: '×', can_focus: true, style_class: 'linux-island__todo-action', accessible_name: 'Delete task', y_align: Clutter.ActorAlign.CENTER});
            remove.connect('clicked', () => this._call('RemoveTask', new GLib.Variant('(s)', [item.id]), ok => { if (!ok) this._status.text = 'Could not delete task'; }));
            row.add_child(remove);
            this._list.add_child(row);
        }
    }
    setWidth(width) { this.actor.width = Math.max(0, width); }
    destroy() { this._destroyed = true; this.actor.destroy(); this._proxy = null; }
}
