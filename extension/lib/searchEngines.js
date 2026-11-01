// Web search engine registry for Linux Island.
// Pure data + URL construction so it can be unit tested under Node.

export const DEFAULT_SEARCH_ENGINE = 'google';

export const SEARCH_ENGINES = Object.freeze([
    {id: 'google', label: 'Google', template: 'https://www.google.com/search?q='},
    {id: 'brave', label: 'Brave', template: 'https://search.brave.com/search?q='},
]);

export function buildSearchUrl(engineId, query) {
    const text = typeof query === 'string' ? query.trim() : '';
    if (!text || text.length > 500) return '';
    const engine = SEARCH_ENGINES.find(e => e.id === engineId) ?? SEARCH_ENGINES[0];
    return engine.template + encodeURIComponent(text);
}

export function isValidNavigationUrl(url) {
    if (typeof url !== 'string') return false;
    const text = url.trim();
    if (!text || /[\s\u0000-\u001F\u007F]/.test(text)) return false;
    const match = /^https?:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(text);
    if (!match) return false;
    let authority = match[1];
    const atIdx = authority.lastIndexOf('@');
    if (atIdx !== -1) {
        authority = authority.slice(atIdx + 1);
    }
    if (!authority) return false;
    let host = authority;
    if (authority.startsWith('[')) {
        const closeIdx = authority.indexOf(']');
        if (closeIdx <= 1) return false;
        host = authority.slice(1, closeIdx);
        const rest = authority.slice(closeIdx + 1);
        if (rest && !/^:\d{1,5}$/.test(rest)) return false;
    } else {
        const colonIdx = authority.indexOf(':');
        if (colonIdx !== -1) {
            host = authority.slice(0, colonIdx);
            const port = authority.slice(colonIdx + 1);
            if (!/^\d{1,5}$/.test(port)) return false;
        }
    }
    return Boolean(host);
}
