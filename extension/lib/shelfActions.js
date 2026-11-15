// Pure URI/formatting helpers + non-blocking GNOME Shell actions for File Shelf.

let Gio = null;
let GLib = null;
let St = null;
if (typeof process === 'undefined') {
    try {
        ({default: Gio} = await import('gi://Gio'));
        ({default: GLib} = await import('gi://GLib'));
        ({default: St} = await import('gi://St'));
    } catch (_) {}
}

export const MAX_URI_BATCH = 32;
export const MAX_URI_LENGTH = 2048;

export function parseUriList(text) {
    if (typeof text !== 'string' || text.length === 0)
        return [];

    const out = [];
    const seen = new Set();
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.length > MAX_URI_LENGTH)
            continue;
        if (!line.startsWith('file://') && !line.startsWith('/'))
            continue;
        if (seen.has(line))
            continue;
        seen.add(line);
        out.push(line);
        if (out.length >= MAX_URI_BATCH)
            break;
    }
    return out;
}

export function formatUriList(items) {
    if (!Array.isArray(items) || items.length === 0)
        return '';
    const uris = items
        .map(item => (typeof item === 'string' ? item : item?.uri))
        .filter(u => typeof u === 'string' && u.length > 0);
    return uris.length > 0 ? `${uris.join('\r\n')}\r\n` : '';
}

export function formatFileCountLabel(count) {
    const n = Math.max(0, Number(count) || 0);
    return n === 1 ? '1 file' : `${n} files`;
}

export function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = n;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx++;
    }
    const text = idx === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
    return `${text} ${units[idx]}`;
}

export function itemIconName(item) {
    if (!item)
        return 'text-x-generic-symbolic';
    if (item.isDir)
        return 'folder-symbolic';
    const mime = String(item.mimeType ?? '');
    if (mime.startsWith('image/'))
        return 'image-x-generic-symbolic';
    if (mime.startsWith('audio/'))
        return 'audio-x-generic-symbolic';
    if (mime.startsWith('video/'))
        return 'video-x-generic-symbolic';
    if (mime === 'application/pdf' || mime.startsWith('text/'))
        return 'x-office-document-symbolic';
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('compressed') || mime.includes('archive'))
        return 'package-x-generic-symbolic';
    return 'text-x-generic-symbolic';
}

export function openShelfItem(item, deps = {}) {
    const gio = deps.gio ?? Gio;
    const uri = item?.uri;
    if (!gio || !uri)
        return false;
    try {
        gio.AppInfo.launch_default_for_uri_async(uri, null, null, null);
        return true;
    } catch (_) {
        return false;
    }
}

export function revealShelfItem(item, deps = {}) {
    const gio = deps.gio ?? Gio;
    const glib = deps.glib ?? GLib;
    const uri = item?.uri;
    if (!gio || !glib || !uri)
        return false;
    try {
        gio.DBus.session.call(
            'org.freedesktop.FileManager1',
            '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1',
            'ShowItems',
            new glib.Variant('(ass)', [[uri], '']),
            null,
            gio.DBusCallFlags.NONE,
            -1,
            null,
            null
        );
        return true;
    } catch (_) {
        return false;
    }
}

export function copyShelfItemsToClipboard(items, deps = {}) {
    const st = deps.st ?? St;
    const glib = deps.glib ?? GLib;
    const payload = formatUriList(items);
    if (!st || !glib || !payload)
        return false;
    try {
        const clipboard = st.Clipboard.get_default();
        const bytes = glib.Bytes.new(new TextEncoder().encode(payload));
        clipboard.set_content(st.ClipboardType.CLIPBOARD, 'text/uri-list', bytes);
        return true;
    } catch (_) {
        return false;
    }
}

export function pasteClipboardToShelf(onUris, deps = {}) {
    const st = deps.st ?? St;
    if (!st || typeof onUris !== 'function')
        return false;
    try {
        const clipboard = st.Clipboard.get_default();
        clipboard.get_content(st.ClipboardType.CLIPBOARD, 'text/uri-list', (_cb, bytes) => {
            let uris = [];
            if (bytes) {
                try {
                    const data = bytes.get_data();
                    const text = new TextDecoder('utf-8').decode(data);
                    uris = parseUriList(text);
                } catch (_) {}
            }
            if (uris.length > 0) {
                onUris(uris);
                return;
            }
            clipboard.get_text(st.ClipboardType.CLIPBOARD, (_cb2, text) => {
                const parsed = parseUriList(text ?? '');
                if (parsed.length > 0)
                    onUris(parsed);
            });
        });
        return true;
    } catch (_) {
        return false;
    }
}

export function openFileChooserPortal(onUris, deps = {}) {
    const gio = deps.gio ?? Gio;
    const glib = deps.glib ?? GLib;
    if (!gio || !glib || typeof onUris !== 'function')
        return false;

    const token = `linux_island_shelf_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    let subId = 0;

    const cleanupSub = () => {
        if (subId > 0) {
            try {
                gio.DBus.session.signal_unsubscribe(subId);
            } catch (_) {}
            subId = 0;
        }
    };

    try {
        const options = {
            handle_token: new glib.Variant('s', token),
            multiple: new glib.Variant('b', true),
            modal: new glib.Variant('b', false),
        };
        gio.DBus.session.call(
            'org.freedesktop.portal.Desktop',
            '/org/freedesktop/portal/desktop',
            'org.freedesktop.portal.FileChooser',
            'OpenFile',
            new glib.Variant('(ssa{sv})', ['', 'Add Files to Shelf', options]),
            null,
            gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn, res) => {
                try {
                    const reply = conn.call_finish(res);
                    const [requestPath] = reply.deepUnpack();
                    subId = conn.signal_subscribe(
                        'org.freedesktop.portal.Desktop',
                        'org.freedesktop.portal.Request',
                        'Response',
                        requestPath,
                        null,
                        gio.DBusCallFlags.NONE,
                        (_c, _sender, _path, _iface, _sig, params) => {
                            cleanupSub();
                            try {
                                const [code, results] = params.deepUnpack();
                                if (code === 0 && results && results.uris) {
                                    const rawUris = results.uris.deepUnpack();
                                    const clean = parseUriList((rawUris ?? []).join('\n'));
                                    if (clean.length > 0)
                                        onUris(clean);
                                }
                            } catch (_) {}
                        }
                    );
                } catch (_) {
                    cleanupSub();
                }
            }
        );
        return true;
    } catch (_) {
        cleanupSub();
        return false;
    }
}

export function launchShelfPopout(deps = {}) {
    const gio = deps.gio ?? Gio;
    if (!gio)
        return false;
    try {
        gio.Subprocess.new(['linux-island-ui', '--shelf-popout'], gio.SubprocessFlags.NONE);
        return true;
    } catch (_) {
        return false;
    }
}
