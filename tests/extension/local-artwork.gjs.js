// Run with gjs -m. Uses temporary synthetic artwork, never user metadata.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import {loadLocalArtwork} from '../../extension/lib/localArtwork.js';

function expect(value, label) {
    if (!value) throw new Error(label);
}
const dir = GLib.dir_make_tmp('linux-island-artwork-XXXXXX');
const imagePath = GLib.build_filenamev([dir, 'valid.png']);
const badPath = GLib.build_filenamev([dir, 'bad.png']);
const bigPath = GLib.build_filenamev([dir, 'big.png']);
const linkPath = GLib.build_filenamev([dir, 'link.png']);
const hugePath = GLib.build_filenamev([dir, 'huge.png']);
const pixbuf = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, 48, 48);
pixbuf.fill(0xd8b77fff);
pixbuf.savev(imagePath, 'png', [], []);
GLib.file_set_contents(badPath, 'not an image');
GLib.file_set_contents(bigPath, new Uint8Array(4 * 1024 * 1024 + 1));
const huge = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, 4097, 1);
huge.fill(0xd8b77fff);
huge.savev(hugePath, 'png', [], []);
Gio.File.new_for_path(linkPath).make_symbolic_link(imagePath, null);
const uri = path => Gio.File.new_for_path(path).get_uri();
await (async () => {
    try {
        const icon = await loadLocalArtwork(uri(imagePath), new Gio.Cancellable());
        expect(icon instanceof Gio.FileIcon, 'valid owned PNG must load');
        const cacheSubdir = GLib.build_filenamev([dir, 'artwork']);
        GLib.mkdir_with_parents(cacheSubdir, 0o700);
        const cachedArtPath = GLib.build_filenamev([cacheSubdir, 'a1b2c3d4e5f6.png']);
        pixbuf.savev(cachedArtPath, 'png', [], []);
        const cachedIcon = await loadLocalArtwork(uri(cachedArtPath), new Gio.Cancellable());
        expect(cachedIcon instanceof Gio.FileIcon, 'cached artwork from user directory must load');
        GLib.unlink(cachedArtPath);
        GLib.rmdir(cacheSubdir);
        for (const value of ['', 'https://example.com/art.png', 'file://remote/tmp/art.png',
            uri(badPath), uri(bigPath), uri(linkPath), uri(hugePath), uri(dir), uri(dir + '/missing')]) {
            expect(await loadLocalArtwork(value, new Gio.Cancellable()) === null, 'invalid artwork rejected');
        }
        const cancelled = new Gio.Cancellable();
        cancelled.cancel();
        expect(await loadLocalArtwork(uri(imagePath), cancelled) === null, 'cancelled load rejected');
        print('PASS: valid local artwork, URI/file/dimension limits, symlink rejection and cancellation');
    } finally {
        for (const path of [imagePath, badPath, bigPath, linkPath, hugePath]) GLib.unlink(path);
        GLib.rmdir(dir);
    }
})();
