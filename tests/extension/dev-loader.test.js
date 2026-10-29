// Stage C: tests for the *real* dev loader extension.
//
// The previous version of this file tested a helper that the loader never
// imported, so a broken loader could still pass. This version imports
// scripts/dev/dev-loader-extension.js — the exact file installed as the GNOME
// extension — with gi:// and Shell modules stubbed.
//
// These tests validate lifecycle logic. They are NOT GNOME compatibility
// evidence: no real Shell, no real actors.

import {registerHooks} from 'node:module';

// --- stub GNOME modules ----------------------------------------------------

const state = {
    pointer: '/run/user/1000/linux-island-dev/run-1',
    pointerReadable: true,
    cssExists: true,
    extensionModule: null,   // what `import(file://.../extension.js)` resolves to
    importDelayMs: 0,
    stylesheetsLoaded: [],
    stylesheetsUnloaded: [],
    created: [],
};

const STAGE = '/run/user/1000/linux-island-dev';

const stubs = {
    'gi://GLib': `
        export default {
            get_user_runtime_dir: () => '/run/user/1000',
            file_get_contents: (p) => globalThis.__state.pointerReadable
                ? [true, new TextEncoder().encode(globalThis.__state.pointer)]
                : [false, null],
        };`,
    'gi://Gio': `
        export default {
            File: {new_for_path: (p) => ({
                path: p,
                query_exists: () => globalThis.__state.cssExists,
            })},
        };`,
    'gi://St': `
        export default {
            ThemeContext: {get_for_stage: () => ({
                get_theme: () => ({
                    load_stylesheet: (f) => globalThis.__state.stylesheetsLoaded.push(f.path),
                    unload_stylesheet: (f) => globalThis.__state.stylesheetsUnloaded.push(f.path),
                }),
            })},
        };`,
    'resource:///org/gnome/shell/extensions/extension.js': `
        export class Extension {
            constructor(metadata) { this.metadata = metadata; }
        }`,
};

function isStagedExtensionUrl(url) {
    return typeof url === 'string'
        && url.startsWith('file:///run/user/')
        && url.includes('linux-island-dev/')
        && url.endsWith('/extension.js');
}

registerHooks({
    resolve(spec, context, next) {
        if (stubs[spec])
            return {url: `stub:${spec}`, shortCircuit: true};
        // The staged extension does not exist on disk in this test, so the
        // default resolver would fail before `load` is reached. Short-circuit
        // it here and supply the fake source in load().
        if (isStagedExtensionUrl(spec))
            return {url: spec, shortCircuit: true};
        return next(spec, context);
    },
    load(url, context, next) {
        if (url.startsWith('stub:'))
            return {format: 'module', source: stubs[url.slice(5)], shortCircuit: true};
        // The loader dynamically imports file://<dir>/extension.js. Redirect
        // that to a controllable module instead of the real extension.
        // (Check the *parent* module too: Node resolves the specifier first.)
        if (isStagedExtensionUrl(url))
            return {format: 'module', source: globalThis.__extensionSource, shortCircuit: true};
        return next(url, context);
    },
});

globalThis.__state = state;

// Default fake extension module: records enable/disable calls.
// Behaviour is read from __state at call time: Node caches modules per URL
// exactly like GJS, so baking values into the source would leak across tests.
function setExtensionSource({fail = false, delayMs = 0} = {}) {
    globalThis.__state.enableDelayMs = delayMs;
    globalThis.__state.enableFails = fail;
    globalThis.__extensionSource = `
        export default class FakeExtension {
            constructor(metadata) {
                globalThis.__state.created.push(metadata.path);
                this.metadata = metadata;
                this.enabled = false;
            }
            async enable() {
                const delay = globalThis.__state.enableDelayMs || 0;
                if (delay)
                    await new Promise(r => setTimeout(r, delay));
                if (globalThis.__state.enableFails)
                    throw new Error('boom');
                this.enabled = true;
                globalThis.__state.enabledCount = (globalThis.__state.enabledCount || 0) + 1;
            }
            disable() {
                this.enabled = false;
                globalThis.__state.disabledCount = (globalThis.__state.disabledCount || 0) + 1;
            }
        }`;
}

setExtensionSource();

const {default: Loader} = await import('../../scripts/dev/dev-loader-extension.js');

// --- harness ---------------------------------------------------------------

let passed = 0;
const failures = [];

let generationCounter = 0;

function reset() {
    generationCounter++;
    state.pointer = `${STAGE}/run-${generationCounter}`;
    state.pointerReadable = true;
    state.cssExists = true;
    state.stylesheetsLoaded = [];
    state.stylesheetsUnloaded = [];
    state.created = [];
    state.enabledCount = 0;
    state.disabledCount = 0;
    setExtensionSource();
}

async function test(name, fn) {
    reset();
    try {
        await fn();
        passed++;
        console.log(`PASS: ${name}`);
    } catch (e) {
        failures.push(`${name}: ${e.message}`);
        console.error(`FAIL: ${name}: ${e.message}`);
    }
}

const settle = (ms = 40) => new Promise(r => setTimeout(r, ms));

function makeLoader() {
    return new Loader({uuid: 'island-dev@local', name: 'dev'});
}

// --- tests -----------------------------------------------------------------

await test('loads the staged extension and logs readiness', async () => {
    const loader = makeLoader();
    loader.enable();
    await settle();
    if (state.enabledCount !== 1)
        throw new Error(`expected 1 enable, got ${state.enabledCount}`);
    if (state.created[0] !== state.pointer)
        throw new Error(`wrong dir: ${state.created[0]} != ${state.pointer}`);
});

await test('loads CSS only after a successful import', async () => {
    const loader = makeLoader();
    loader.enable();
    await settle();
    if (state.stylesheetsLoaded.length !== 1)
        throw new Error(`expected 1 stylesheet load, got ${state.stylesheetsLoaded.length}`);
    if (state.stylesheetsLoaded[0] !== `${state.pointer}/stylesheet.css`)
        throw new Error(`wrong stylesheet: ${state.stylesheetsLoaded[0]}`);
});

await test('failed import does not load CSS', async () => {
    setExtensionSource({fail: true});
    const loader = makeLoader();
    loader.enable();
    await settle();
    if (state.stylesheetsLoaded.length !== 0)
        throw new Error('CSS must not be applied when the import fails');
});

await test('refuses to load outside the stage root', async () => {
    state.pointer = '/home/user/.local/share/gnome-shell/extensions/linux-island@local';
    const loader = makeLoader();
    loader.enable();
    await settle();
    if (state.created.length !== 0)
        throw new Error('must not import outside the stage root');
});

await test('disable during a slow import leaves no active instance', async () => {
    setExtensionSource({delayMs: 60});
    const loader = makeLoader();
    loader.enable();
    await settle(10);          // import still in flight
    loader.disable();          // supersede it
    await settle(120);         // let the stale import finish
    if (state.enabledCount !== 1)
        throw new Error('the stale instance should have been enabled then cleaned up');
    if (state.disabledCount < 1)
        throw new Error('stale instance must be disabled, not leaked');
    if (state.stylesheetsLoaded.length !== 0)
        throw new Error('stale generation must not apply CSS');
});

await test('two rapid enables commit only the newest generation', async () => {
    setExtensionSource({delayMs: 30});
    const loader = makeLoader();
    loader.enable();
    await settle(5);
    loader.enable();
    await settle(150);
    if (state.stylesheetsLoaded.length !== 1)
        throw new Error(`expected exactly 1 committed CSS load, got ${state.stylesheetsLoaded.length}`);
    if (state.disabledCount !== 1)
        throw new Error(`expected the superseded instance to be disabled, got ${state.disabledCount}`);
});

await test('disable unloads the stylesheet it loaded', async () => {
    const loader = makeLoader();
    loader.enable();
    await settle();
    loader.disable();
    if (state.stylesheetsUnloaded.length !== 1)
        throw new Error(`expected 1 unload, got ${state.stylesheetsUnloaded.length}`);
    if (state.disabledCount !== 1)
        throw new Error('instance must be disabled');
});

await test('missing pointer file is reported, not thrown at enable()', async () => {
    state.pointerReadable = false;
    const loader = makeLoader();
    let threw = false;
    try {
        loader.enable();       // must be synchronous and not throw
    } catch {
        threw = true;
    }
    await settle();
    if (threw)
        throw new Error('enable() must not throw synchronously');
    if (state.created.length !== 0)
        throw new Error('nothing should be created');
});

await test('missing stylesheet is tolerated', async () => {
    state.cssExists = false;
    const loader = makeLoader();
    loader.enable();
    await settle();
    if (state.enabledCount !== 1)
        throw new Error('extension should still load without CSS');
    if (state.stylesheetsLoaded.length !== 0)
        throw new Error('no stylesheet should be loaded');
});

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0)
    process.exitCode = 1;
