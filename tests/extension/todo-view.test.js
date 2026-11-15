import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
class Actor {
    constructor(props = {}) { Object.assign(this, props); this.children = []; this.handlers = {}; this.clutter_text = {connect() {}, set_markup(value) { this.markup = value; }, ellipsize: 0}; }
    add_child(child) { this.children.push(child); }
    connect(name, cb) { this.handlers[name] = cb; }
    destroy_all_children() { this.children = []; }
    destroy() {}
    get_text() { return this.text || ''; }
    set_text(text) { this.text = text; }
}
const calls = [];
const proxy = {g_name_owner: ':1.1', handlers: {}, connect(n, cb) { this.handlers[n] = cb; },
    call(method, args, _flags, _timeout, _cancel, cb) { calls.push({method, args}); cb(this, {method}); },
    call_finish(result) { return {deepUnpack: () => [result.method === 'GetTasks' ? '[]' : true]}; }};
globalThis.todoTest = {St: {BoxLayout: Actor, Label: Actor, Entry: Actor, Button: Actor, ScrollView: Actor},
    Clutter: {ActorAlign: {CENTER: 0}}, GLib: {markup_escape_text: text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'), Variant: class { constructor(type, value) { this.type = type; this.value = value; }}},
    Gio: {BusType: {SESSION: 0}, DBusProxyFlags: {NONE: 0}, DBusCallFlags: {NONE: 0},
        DBusProxy: {new_for_bus(...args) { args.at(-1)(null, {}); }, new_for_bus_finish() { return proxy; }}}};
let source = await readFile(new URL('../../extension/ui/todoView.js', import.meta.url), 'utf8');
source = source.replace(/^import .* from 'gi:\/\/.*';$/gm, '').replace('// Shared task list,', 'const {St, Clutter, Gio, GLib} = globalThis.todoTest;\n// Shared task list,');
const {TodoSection} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const view = new TodoSection();
assert.equal(view._status.text, 'No tasks yet');
view._entry.set_text('  Read  ');
view._add();
assert.equal(calls.at(-1).method, 'AddTask');
assert.deepEqual(calls.at(-1).args.value, ['Read']);
assert.equal(view._entry.get_text(), '');
proxy.handlers['g-signal'](proxy, null, 'Changed', {deepUnpack: () => [JSON.stringify([{id:'abc', title:'Read', done:false}])]});
assert.equal(view._status.text, '1 remaining');
const row = view._list.children[0];
row.children[0].handlers.clicked();
assert.equal(calls.at(-1).method, 'SetDone');
assert.deepEqual(calls.at(-1).args.value, ['abc', true]);
row.children[2].handlers.clicked();
assert.equal(calls.at(-1).method, 'RemoveTask');
proxy.handlers['g-signal'](proxy, null, 'Changed', {deepUnpack: () => [JSON.stringify([{id:'abc', title:'Read <book>', done:true}])]});
assert.equal(view._list.children.length, 0, 'completed task row is hidden');
proxy.handlers['g-signal'](proxy, null, 'Changed', {deepUnpack: () => [JSON.stringify([{id:'abc', title:'Read <book>', done:false}])]});
assert.equal(view._list.children[0].children[1].text, 'Read <book>');
view.destroy();
console.log('PASS: todo view add, completion and delete');
