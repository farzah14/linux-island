// Only vetted local player artwork; no network requests or metadata logging.
let Gio = null;
let GLib = null;
let GdkPixbuf = null;
if (typeof process === 'undefined') {
    Gio = (await import('gi://Gio')).default;
    GLib = (await import('gi://GLib')).default;
    GdkPixbuf = (await import('gi://GdkPixbuf')).default;
}

export async function loadLocalArtwork(uri, cancellable) {
    if (!Gio || typeof uri !== 'string' || !uri.startsWith('file:///') ||
        uri.length > 4096 || cancellable?.is_cancelled())
        return null;
    try {
        const file = Gio.File.new_for_uri(uri);
        const path = file.get_path();
        if (!path) return null;
        const info = await new Promise((resolve, reject) => {
            file.query_info_async('standard::type,standard::size,standard::is-symlink,owner::user',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancellable,
                (source, result) => {
                    try { resolve(source.query_info_finish(result)); }
                    catch (error) { reject(error); }
                });
        });
        if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_is_symlink() ||
            info.get_size() <= 0 || info.get_size() > 4 * 1024 * 1024 ||
            info.get_attribute_string('owner::user') !== GLib.get_user_name())
            return null;
        const [format, width, height] = await new Promise((resolve, reject) => {
            GdkPixbuf.Pixbuf.get_file_info_async(path, cancellable, (_source, result) => {
                try { resolve(GdkPixbuf.Pixbuf.get_file_info_finish(result)); }
                catch (error) { reject(error); }
            });
        });
        if (!format || !['png', 'jpeg', 'webp'].includes(format.get_name()) ||
            width <= 0 || height <= 0 || width > 4096 || height > 4096 ||
            cancellable?.is_cancelled())
            return null;
        return new Gio.FileIcon({file});
    } catch (_) {
        return null; // Missing, corrupt or cancelled artwork keeps the placeholder.
    }
}
