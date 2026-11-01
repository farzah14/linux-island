import {DEFAULT_SEARCH_ENGINE, SEARCH_ENGINES, buildSearchUrl, isValidNavigationUrl} from '../../extension/lib/searchEngines.js';

function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
    }
}

// 1. Only Google and Brave Search are user-selectable
{
    assertEqual(SEARCH_ENGINES.length, 2);
    assertEqual(DEFAULT_SEARCH_ENGINE, 'google');
    assertEqual(SEARCH_ENGINES.map(e => e.id).join(','), 'google,brave');
    assertEqual(SEARCH_ENGINES.map(e => e.label).join(','), 'Google,Brave');
}

// 2. Every engine builds its own prefix
{
    const expected = {
        google: 'https://www.google.com/search?q=',
        brave: 'https://search.brave.com/search?q=',
    };
    for (const [id, prefix] of Object.entries(expected)) {
        assertEqual(buildSearchUrl(id, 'linux island'), `${prefix}linux%20island`, id);
    }
}

// 3. Reserved characters are percent encoded
assertEqual(buildSearchUrl('google', 'a&b#c?d'), 'https://www.google.com/search?q=a%26b%23c%3Fd');

// 4. Query trimming
assertEqual(buildSearchUrl('google', '  cats  '), 'https://www.google.com/search?q=cats');

// 5. Empty and oversized queries are rejected
assertEqual(buildSearchUrl('google', '   '), '');
assertEqual(buildSearchUrl('google', ''), '');
assertEqual(buildSearchUrl('google', null), '');
assertEqual(buildSearchUrl('google', 42), '');
assertEqual(buildSearchUrl('google', 'a'.repeat(501)), '');
assert(buildSearchUrl('google', 'a'.repeat(500)).length > 0, '500 character query is accepted');

// 6. Unknown engine falls back to Google
assertEqual(buildSearchUrl('yandex', 'linux island'), 'https://www.google.com/search?q=linux%20island');
assertEqual(buildSearchUrl('duckduckgo', 'linux island'), 'https://www.google.com/search?q=linux%20island');
assertEqual(buildSearchUrl('bing', 'linux island'), 'https://www.google.com/search?q=linux%20island');

// 7. Navigation scheme validation
assert(isValidNavigationUrl('https://www.google.com'), 'https is valid');
assert(isValidNavigationUrl('http://example.org/path?q=1'), 'http is valid');
assert(isValidNavigationUrl('HTTPS://SEARCH.BRAVE.COM/'), 'case insensitive scheme is valid');
assert(!isValidNavigationUrl('javascript:alert(1)'), 'javascript: rejected');
assert(!isValidNavigationUrl('file:///etc/passwd'), 'file:/// rejected');
assert(!isValidNavigationUrl('data:text/html,test'), 'data: rejected');
assert(!isValidNavigationUrl('ftp://ftp.example.com'), 'ftp: rejected');
assert(!isValidNavigationUrl('about:blank'), 'about: rejected');
assert(!isValidNavigationUrl(''), 'empty rejected');
assert(!isValidNavigationUrl('   '), 'whitespace rejected');
assert(!isValidNavigationUrl(null), 'null rejected');
assert(!isValidNavigationUrl('not a url'), 'invalid url rejected');

// 8. Empty-host and malformed-authority boundaries
assert(!isValidNavigationUrl('https://'), 'scheme without host rejected');
assert(!isValidNavigationUrl('https:///path'), 'empty authority with path rejected');
assert(!isValidNavigationUrl('http://:80'), 'port-only authority rejected');
assert(!isValidNavigationUrl('https://example.com:notaport'), 'non-numeric port rejected');
assert(!isValidNavigationUrl('https://user@'), 'credentials without host rejected');
assert(isValidNavigationUrl('https://user@example.com:8443/path'), 'credentials, port, and path accepted');
assert(isValidNavigationUrl('http://[::1]:8080/x'), 'IPv6 literal with port accepted');
assert(isValidNavigationUrl('https://example.com?q=1'), 'query-only suffix accepted');
assert(isValidNavigationUrl('https://example.com#frag'), 'fragment-only suffix accepted');
assert(!isValidNavigationUrl('https://exa mple.com'), 'whitespace in URL rejected');

// 9. Generated search URLs are always navigable
for (const engine of SEARCH_ENGINES) {
    assert(isValidNavigationUrl(buildSearchUrl(engine.id, 'linux island')),
        `${engine.id} generated search URL is valid`);
}

console.log('PASS: search engine URL builder tests');
