import assert from 'node:assert/strict';
import {
    EMPTY_SHELF,
    INITIAL_SHELF_STATE,
    ShelfProxy,
    normalizeShelfSnapshot,
    reconcileShelfState,
} from '../../extension/lib/shelfProxy.js';
import {
    formatBytes,
    formatFileCountLabel,
    formatUriList,
    itemIconName,
    parseUriList,
} from '../../extension/lib/shelfActions.js';

function baseState() {
    return {
        connected: true,
        owner: ':1.42',
        shelfRevision: 3,
        shelf: {
            revision: 3,
            count: 1,
            maxItems: 12,
            items: [{
                id: 'abc123',
                uri: 'file:///tmp/a.txt',
                path: '/tmp/a.txt',
                name: 'a.txt',
                mimeType: 'text/plain',
                sizeBytes: 128,
                isDir: false,
                addedAtMs: 1700000000,
                exists: true,
            }],
        },
        shelfServiceAvailable: true,
    };
}

// 1. OWNER_CHANGED null resets shelf cleanly; live same owner preserves state.
{
    const reset = reconcileShelfState(baseState(), {type: 'OWNER_CHANGED', nameOwner: null});
    assert.equal(reset.connected, false);
    assert.equal(reset.owner, null);
    assert.equal(reset.shelfRevision, -1);
    assert.equal(reset.shelf.count, 0);
    assert.equal(reset.shelfServiceAvailable, false);

    const sameOwner = reconcileShelfState(baseState(), {type: 'OWNER_CHANGED', nameOwner: ':1.42'});
    assert.equal(sameOwner.shelfRevision, 3);
    assert.equal(sameOwner.shelf.count, 1);

    const newOwner = reconcileShelfState(baseState(), {type: 'OWNER_CHANGED', nameOwner: ':1.99'});
    assert.equal(newOwner.owner, ':1.99');
    assert.equal(newOwner.shelfRevision, -1);
}

// 2. Stale/duplicate revisions rejected for same owner; newer accepted; new owner rev 0 accepted.
{
    const stale = reconcileShelfState(baseState(), {
        type: 'SHELF_CHANGED',
        owner: ':1.42',
        revision: 2,
        shelf: {count: 0, items: []},
    });
    assert.equal(stale.shelfRevision, 3);
    assert.equal(stale.shelf.count, 1);

    const dup = reconcileShelfState(baseState(), {
        type: 'SHELF_CHANGED',
        owner: ':1.42',
        revision: 3,
        shelf: {count: 0, items: []},
    });
    assert.equal(dup.shelf.count, 1);

    const newer = reconcileShelfState(baseState(), {
        type: 'SHELF_CHANGED',
        owner: ':1.42',
        revision: 4,
        shelf: {count: 0, maxItems: 12, items: []},
    });
    assert.equal(newer.shelfRevision, 4);
    assert.equal(newer.shelf.count, 0);

    const reset = reconcileShelfState(baseState(), {type: 'OWNER_CHANGED', nameOwner: null});
    const adopted = reconcileShelfState(reset, {
        type: 'SHELF_CHANGED',
        owner: ':1.55',
        revision: 0,
        shelf: EMPTY_SHELF,
    });
    assert.equal(adopted.shelfRevision, 0);
    assert.equal(adopted.shelfServiceAvailable, true);
}

// 3. normalizeShelfSnapshot sanitizes partial items.
{
    const snap = normalizeShelfSnapshot({revision: 2, items: [{id: 'x', path: '/tmp/x'}]});
    assert.equal(snap.count, 1);
    assert.equal(snap.maxItems, 12);
    assert.equal(snap.items[0].mimeType, 'application/octet-stream');
    assert.equal(snap.items[0].exists, true);
}

// 4. ShelfProxy lifecycle without bus.
{
    let calls = 0;
    const proxy = new ShelfProxy({deferInit: true, onStateChanged: () => { calls++; }});
    assert.deepEqual(proxy.state, INITIAL_SHELF_STATE);
    proxy.destroy();
    assert.equal(proxy.isDestroyed, true);
    proxy._setState({...INITIAL_SHELF_STATE, connected: true});
    assert.equal(calls, 0);
}

// 5. shelfActions pure URI, size, and icon helpers.
{
    const parsed = parseUriList('# comment\n\nhttps://bad.example/file\nfile:///tmp/one.txt\r\n/tmp/two.png\nfile:///tmp/one.txt\n');
    assert.deepEqual(parsed, ['file:///tmp/one.txt', '/tmp/two.png']);

    const many = Array.from({length: 40}, (_, i) => `/tmp/f${i}.txt`).join('\n');
    assert.equal(parseUriList(many).length, 32, 'caps batch at 32 URIs');

    assert.equal(formatUriList([{uri: 'file:///a'}, {uri: 'file:///b'}]), 'file:///a\r\nfile:///b\r\n');
    assert.equal(formatFileCountLabel(0), '0 files');
    assert.equal(formatFileCountLabel(1), '1 file');
    assert.equal(formatFileCountLabel(5), '5 files');
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(itemIconName({isDir: true}), 'folder-symbolic');
    assert.equal(itemIconName({isDir: false, mimeType: 'image/png'}), 'image-x-generic-symbolic');
    assert.equal(itemIconName({isDir: false, mimeType: 'application/pdf'}), 'x-office-document-symbolic');
}

console.log('PASS: shelf-proxy and shelf-actions tests passed');
