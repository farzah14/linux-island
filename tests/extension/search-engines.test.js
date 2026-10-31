import {DEFAULT_SEARCH_ENGINE, SEARCH_ENGINES, buildSearchUrl, isValidNavigationUrl} from '../../extension/lib/searchEngines.js';

function assert(condition, message = 'Assertion failed') {
    if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message ? message + ': ' : ''}expected ${expected}, got ${actual}`);
    }
}

// 1. Engine registry order and shape
{
    assertEqual(SEARCH_ENGINES.length, 4);
    assertEqual(DEFAULT_SEARCH_ENGINE, 'google');
    assertEqual(SEARCH_ENGINES.map(e => e.id).join(','), 'google,duckduckgo,brave,bing');
    assertEqual(SEARCH_ENGINES.map(e => e.label).join(','), 'Google,DuckDuckGo,Brave,Bing');
}

// 2. Every engine builds its own prefix
{
    const expected = {
        google: 'https://www.google.com/search?q=',
        duckduckgo: 'https://duckduckgo.com/?q=',
        brave: 'https://search.brave.com/search?q=',
        bing: 'https://www.bing.com/search?q=',
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

console.log('PASS: search engine URL builder tests');
