import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

class Actor {
    constructor(props = {}) {
        Object.assign(this, {visible: true, width: 0, children: [], handlers: {}}, props);
        this.text = props.text ?? '';
        this.clutter_text = {set_ellipsize() {}};
        this.style_class = props.style_class ?? '';
    }
    add_child(child) { this.children.push(child); }
    remove_child(child) { this.children = this.children.filter(c => c !== child); }
    connect(name, fn) { this.handlers[name] = fn; return name; }
    destroy() { this.destroyed = true; }
}

globalThis.renderTest = {
    St: {BoxLayout: Actor, Label: Actor, Widget: Actor, Button: Actor, Icon: Actor, ScrollView: Actor, PolicyType: {NEVER: 0, AUTOMATIC: 1}},
    Clutter: {ActorAlign: {CENTER: 1, END: 2, START: 3, FILL: 4}},
    Pango: {EllipsizeMode: {END: 3}},
    formatBytes: b => `${b} B`,
    formatFileCountLabel: c => (c === 1 ? '1 file' : `${c} files`),
    itemIconName: item => (item?.isDir ? 'folder-symbolic' : 'text-x-generic-symbolic'),
};

const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const transform = source => source
    .replace(/^import .*shelfActions\.js';$/gm, 'const {formatBytes, formatFileCountLabel, itemIconName} = globalThis.renderTest;')
    .replace('let St = null;', 'let St = globalThis.renderTest.St;')
    .replace('let Clutter = null;', 'let Clutter = globalThis.renderTest.Clutter;')
    .replace('let Pango = null;', 'let Pango = globalThis.renderTest.Pango;')
    .replace("&& typeof process === 'undefined'", '');

const source = await readFile(new URL('../../extension/ui/shelfView.js', import.meta.url), 'utf8');
const {ShelfSection} = await load(transform(source));

// 1. Empty shelf shows dropzone CTA and hides Clear/Copy/Popout buttons.
{
    let picked = 0;
    let pasted = 0;
    const section = new ShelfSection({
        onPickFiles: () => { picked++; },
        onPasteFiles: () => { pasted++; },
    });
    section.setShelf({count: 0, maxItems: 12, items: []});

    assert.equal(section._countLabel.text, '0/12');
    assert.equal(section._emptyBox.visible, true);
    assert.equal(section._listBox.visible, false);
    assert.equal(section._clearBtn.visible, false);
    assert.equal(section._copyAllBtn.visible, false);

    section._addBtn.handlers.clicked();
    section._pasteBtn.handlers.clicked();
    assert.equal(picked, 1);
    assert.equal(pasted, 1);
    section.destroy();
}

// 2. Populated shelf renders rows, missing badge, and invokes item callbacks.
{
    const opened = [];
    const revealed = [];
    const copied = [];
    const removed = [];
    let cleared = 0;
    let popout = 0;

    const section = new ShelfSection({
        onOpenItem: item => opened.push(item.id),
        onRevealItem: item => revealed.push(item.id),
        onCopyItems: items => copied.push(items.map(i => i.id)),
        onRemoveFile: id => removed.push(id),
        onClearShelf: () => { cleared++; },
        onPopoutDrag: () => { popout++; },
    });

    const items = [
        {id: '1', uri: 'file:///tmp/doc.pdf', path: '/tmp/doc.pdf', name: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 512, isDir: false, exists: true},
        {id: '2', uri: 'file:///tmp/gone.txt', path: '/tmp/gone.txt', name: 'gone.txt', mimeType: 'text/plain', sizeBytes: 0, isDir: false, exists: false},
    ];
    section.setShelf({count: 2, maxItems: 12, items});

    assert.equal(section._countLabel.text, '2/12');
    assert.equal(section._emptyBox.visible, false);
    assert.equal(section._listBox.visible, true);
    assert.equal(section._clearBtn.visible, true);
    assert.equal(section._copyAllBtn.visible, true);
    assert.equal(section._rows.length, 2);

    assert.equal(section._rows[1].metaLabel.text, 'Missing');
    section._rows[0].openBtn.handlers.clicked();
    section._rows[0].revealBtn.handlers.clicked();
    section._rows[0].copyBtn.handlers.clicked();
    section._rows[0].removeBtn.handlers.clicked();
    section._copyAllBtn.handlers.clicked();
    section._clearBtn.handlers.clicked();
    section._popoutBtn?.handlers.clicked();

    assert.deepEqual(opened, ['1']);
    assert.deepEqual(revealed, ['1']);
    assert.deepEqual(copied, [['1'], ['1', '2']]);
    assert.deepEqual(removed, ['1']);
    assert.equal(cleared, 1);
    assert.equal(popout, 1);

    section.setWidth(248);
    assert.equal(section.actor.width, 248);
    section.destroy();
    assert.equal(section.actor, null);
}

console.log('PASS: shelf-view tests passed');
