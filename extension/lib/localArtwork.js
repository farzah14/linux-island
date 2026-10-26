// Only vetted local player artwork; no network requests or metadata logging.
let Gio = null;
let GLib = null;
let GdkPixbuf = null;
if (typeof process === 'undefined') {
    Gio = (await import('gi://Gio')).default;
    GLib = (await import('gi://GLib')).default;
    GdkPixbuf = (await import('gi://GdkPixbuf')).default;
}

export async function loadLocalArtwork(uri, cancellable = null) {
    const cancel = cancellable ?? null;
    if (!Gio || typeof uri !== 'string' || uri.length > 4096 || cancel?.is_cancelled())
        return null;

    let file = null;
    if (uri.startsWith('file:///')) {
        file = Gio.File.new_for_uri(uri);
    } else if (uri.startsWith('/')) {
        file = Gio.File.new_for_path(uri);
    } else {
        return null;
    }

    try {
        const path = file.get_path();
        if (!path) return null;
        const info = await new Promise((resolve, reject) => {
            file.query_info_async('standard::type,standard::size,standard::is-symlink,owner::user',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancel,
                (source, result) => {
                    try { resolve(source.query_info_finish(result)); }
                    catch (error) { reject(error); }
                });
        });
        if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_is_symlink() ||
            info.get_size() <= 0 || info.get_size() > 4 * 1024 * 1024)
            return null;
        const owner = info.get_attribute_string('owner::user');
        if (owner && owner !== GLib.get_user_name() && owner !== 'root')
            return null;

        const [format, width, height] = await new Promise((resolve, reject) => {
            GdkPixbuf.Pixbuf.get_file_info_async(path, cancel, (_source, result) => {
                try { resolve(GdkPixbuf.Pixbuf.get_file_info_finish(result)); }
                catch (error) { reject(error); }
            });
        });
        const formatName = format?.get_name()?.toLowerCase();
        if (!format || !['png', 'jpeg', 'jpg', 'webp', 'svg'].includes(formatName) ||
            width <= 0 || height <= 0 || width > 4096 || height > 4096 ||
            cancel?.is_cancelled())
            return null;
        return new Gio.FileIcon({file});
    } catch (_) {
        return null;
    }
}
