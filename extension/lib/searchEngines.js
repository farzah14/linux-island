// Web search engine registry for Linux Island.
// Pure data + URL construction so it can be unit tested under Node.

export const DEFAULT_SEARCH_ENGINE = 'google';

export const SEARCH_ENGINES = Object.freeze([
    {id: 'google', label: 'Google', template: 'https://www.google.com/search?q='},
    {id: 'duckduckgo', label: 'DuckDuckGo', template: 'https://duckduckgo.com/?q='},
    {id: 'brave', label: 'Brave', template: 'https://search.brave.com/search?q='},
    {id: 'bing', label: 'Bing', template: 'https://www.bing.com/search?q='},
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
    if (!text) return false;
    try {
        const parsed = new URL(text);
        const proto = parsed.protocol.toLowerCase();
        return (proto === 'http:' || proto === 'https:') && Boolean(parsed.hostname);
    } catch (_) {
        return false;
    }
}
