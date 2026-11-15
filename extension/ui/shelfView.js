// File Shelf UI section for GNOME Shell extension carousel Page 4.
import {formatBytes, itemIconName} from '../lib/shelfActions.js';

let St = null;
let Clutter = null;
let Pango = null;
if (typeof process === 'undefined') {
    ({default: St} = await import('gi://St'));
    ({default: Clutter} = await import('gi://Clutter'));
    ({default: Pango} = await import('gi://Pango'));
}

export class ShelfSection {
    constructor(options = {}) {
        this._onPickFiles = options.onPickFiles ?? (() => {});
        this._onPasteFiles = options.onPasteFiles ?? (() => {});
        this._onOpenItem = options.onOpenItem ?? (() => {});
        this._onRevealItem = options.onRevealItem ?? (() => {});
        this._onCopyItems = options.onCopyItems ?? (() => {});
        this._onRemoveFile = options.onRemoveFile ?? (() => {});
        this._onClearShelf = options.onClearShelf ?? (() => {});
        this._onPopoutDrag = options.onPopoutDrag ?? (() => {});

        this._shelf = {revision: 0, count: 0, maxItems: 12, items: []};
        this._rows = [];

        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: 'linux-island__shelf-section',
            x_expand: true,
            y_expand: false,
            style: 'spacing: 4px;',
        });

        // Header row: "Shelf" + count + action chips
        this._headerRow = new St.BoxLayout({
            vertical: false,
            style: 'height: 20px; spacing: 4px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._titleLabel = new St.Label({
            text: 'Shelf',
            style_class: 'linux-island__shelf-title',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._headerRow.add_child(this._titleLabel);

        this._countLabel = new St.Label({
            text: '0/12',
            style_class: 'linux-island__shelf-meta',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._headerRow.add_child(this._countLabel);

        this._addBtn = this._makeChip('+ Add', () => this._onPickFiles());
        this._pasteBtn = this._makeChip('Paste', () => this._onPasteFiles());
        this._copyAllBtn = this._makeChip('Copy', () => this._onCopyItems(this._shelf.items ?? []));
        this._popoutBtn = this._makeChip('Drag', () => this._onPopoutDrag());
        this._clearBtn = this._makeChip('Clear', () => this._onClearShelf());

        this._headerRow.add_child(this._addBtn);
        this._headerRow.add_child(this._pasteBtn);
        this._headerRow.add_child(this._copyAllBtn);
        this._headerRow.add_child(this._popoutBtn);
        this._headerRow.add_child(this._clearBtn);
        this.actor.add_child(this._headerRow);

        // Empty state card
        this._emptyBox = new St.BoxLayout({
            vertical: true,
            style_class: 'linux-island__shelf-empty',
            x_expand: true,
            style: 'height: 82px; spacing: 4px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._emptyLabel = new St.Label({
            text: 'Drop files here or use + Add / Paste',
            style_class: 'linux-island__shelf-empty-text',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (this._emptyLabel.clutter_text && typeof this._emptyLabel.clutter_text.set_ellipsize === 'function')
            this._emptyLabel.clutter_text.set_ellipsize(Pango?.EllipsizeMode?.END ?? 3);
        this._emptyBox.add_child(this._emptyLabel);
        this.actor.add_child(this._emptyBox);

        // Scrollable items list
        this._scrollView = new St.ScrollView({
            style: 'height: 86px;',
            x_expand: true,
            hscrollbar_policy: St.PolicyType?.NEVER ?? 0,
            vscrollbar_policy: St.PolicyType?.AUTOMATIC ?? 1,
            visible: false,
        });
        this._listBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 3px;',
            x_expand: true,
            visible: false,
        });
        this._scrollView.add_child(this._listBox);
        this.actor.add_child(this._scrollView);

        this._render();
    }

    _makeChip(label, onClick) {
        const btn = new St.Button({
            label,
            style_class: 'linux-island__shelf-chip',
            can_focus: true,
        });
        btn.connect('clicked', () => onClick());
        return btn;
    }

    _makeAction(label, onClick) {
        const btn = new St.Button({
            label,
            style_class: 'linux-island__shelf-action',
            can_focus: true,
        });
        btn.connect('clicked', () => onClick());
        return btn;
    }

    setShelf(snapshot) {
        this._shelf = snapshot && typeof snapshot === 'object'
            ? {
                revision: Number(snapshot.revision ?? 0),
                count: Number(snapshot.count ?? (snapshot.items?.length ?? 0)),
                maxItems: Number(snapshot.maxItems ?? 12) || 12,
                items: Array.isArray(snapshot.items) ? snapshot.items : [],
            }
            : {revision: 0, count: 0, maxItems: 12, items: []};
        this._render();
    }

    _clearRows() {
        for (const row of this._rows) {
            try {
                this._listBox?.remove_child(row.actor);
                row.actor?.destroy();
            } catch (_) {}
        }
        this._rows = [];
    }

    _render() {
        if (!this.actor)
            return;

        const items = this._shelf.items ?? [];
        const maxItems = this._shelf.maxItems || 12;
        const count = this._shelf.count ?? items.length;
        const hasItems = items.length > 0;

        this._countLabel.text = `${count}/${maxItems}`;
        this._copyAllBtn.visible = hasItems;
        this._popoutBtn.visible = hasItems;
        this._clearBtn.visible = hasItems;

        this._emptyBox.visible = !hasItems;
        this._scrollView.visible = hasItems;
        this._listBox.visible = hasItems;

        this._clearRows();
        for (const item of items) {
            const rowActor = new St.BoxLayout({
                vertical: false,
                style_class: 'linux-island__shelf-row',
                style: 'height: 26px; spacing: 5px;',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const icon = new St.Icon({
                icon_name: itemIconName(item),
                icon_size: 14,
                y_align: Clutter.ActorAlign.CENTER,
            });
            rowActor.add_child(icon);

            const textCol = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const nameLabel = new St.Label({
                text: item.name || item.path || 'File',
                style_class: 'linux-island__shelf-name',
            });
            if (nameLabel.clutter_text && typeof nameLabel.clutter_text.set_ellipsize === 'function')
                nameLabel.clutter_text.set_ellipsize(Pango?.EllipsizeMode?.END ?? 3);

            const metaText = item.exists === false
                ? 'Missing'
                : (item.isDir ? 'Folder' : formatBytes(item.sizeBytes ?? 0));
            const metaLabel = new St.Label({
                text: metaText,
                style_class: 'linux-island__shelf-meta',
            });
            textCol.add_child(nameLabel);
            textCol.add_child(metaLabel);
            rowActor.add_child(textCol);

            const openBtn = this._makeAction('Open', () => this._onOpenItem(item));
            const revealBtn = this._makeAction('Show', () => this._onRevealItem(item));
            const copyBtn = this._makeAction('Copy', () => this._onCopyItems([item]));
            const removeBtn = this._makeAction('×', () => this._onRemoveFile(item.id));

            rowActor.add_child(openBtn);
            rowActor.add_child(revealBtn);
            rowActor.add_child(copyBtn);
            rowActor.add_child(removeBtn);

            this._listBox.add_child(rowActor);
            this._rows.push({
                actor: rowActor,
                item,
                nameLabel,
                metaLabel,
                openBtn,
                revealBtn,
                copyBtn,
                removeBtn,
            });
        }
    }

    setWidth(w) {
        if (!this.actor)
            return;
        const width = Math.max(0, w);
        this.actor.width = width;
        this.actor.style = `width: ${width}px; spacing: 4px;`;
    }

    destroy() {
        this._clearRows();
        if (this.actor) {
            try {
                this.actor.destroy();
            } catch (_) {}
        }
        this.actor = null;
        this._headerRow = null;
        this._titleLabel = null;
        this._countLabel = null;
        this._addBtn = null;
        this._pasteBtn = null;
        this._copyAllBtn = null;
        this._popoutBtn = null;
        this._clearBtn = null;
        this._emptyBox = null;
        this._emptyLabel = null;
        this._scrollView = null;
        this._listBox = null;
        this._shelf = null;
    }
}
