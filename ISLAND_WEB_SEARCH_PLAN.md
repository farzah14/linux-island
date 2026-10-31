# Island web search with engine picker

## Context

The user asked to add "searching anything engine from linux island": type a query inside the expanded Island and open web results in the default browser, with a selectable search engine. The Island has two live frontends — the GNOME Shell extension (`extension/`, the default on GNOME) and the standalone Qt6/QML overlay (`island-ui/`) — and both get the same fourth carousel page: **Search**. Engine choice persists through the existing Core settings store, so it is shared by both frontends and the Settings app. The frozen Core1 D-Bus XML is unchanged; `searchEngine` travels inside the existing `a{sv}` settings map.

Supported engines (ids are wire/settings values, labels are UI text):

| id | label | URL prefix |
|---|---|---|
| `google` | Google | `https://www.google.com/search?q=` |
| `duckduckgo` | DuckDuckGo | `https://duckduckgo.com/?q=` |
| `brave` | Brave | `https://search.brave.com/search?q=` |
| `bing` | Bing | `https://www.bing.com/search?q=` |

Default is `google`. Query is trimmed; empty or longer than 500 UTF-16 code units is rejected (no navigation). Query text is never logged.

## Approach

### 1. Persist the engine in Core settings

- `core/settings/settings_schema.cpp`
  - Add `map[QStringLiteral("searchEngine")] = QStringLiteral("google");` to `defaultSettings()`.
  - Add `QStringLiteral("searchEngine")` to `allowedKeys`.
  - Add `static const QSet<QString> allowedSearchEngines = {QStringLiteral("google"), QStringLiteral("duckduckgo"), QStringLiteral("brave"), QStringLiteral("bing")};`.
  - Add an `else if (key == QLatin1String("searchEngine"))` branch: reject non-`QMetaType::QString` with `"searchEngine must be a string"`; reject values outside the set with `"Invalid searchEngine value: " + val.toString()`.
- `tests/unit/tst_settings_schema.cpp`
  - In `testDefaultSettings` (`tst_settings_schema.cpp:20–33`), assert `defaults.value(QStringLiteral("searchEngine")).toString()` equals `QStringLiteral("google")`.
  - In `testValidPatch` (`tst_settings_schema.cpp:35–69`), add `{QStringLiteral("searchEngine"), QStringLiteral("duckduckgo")}` and assert `res.effective.value(QStringLiteral("searchEngine")).toString()` equals `QStringLiteral("duckduckgo")`.
  - In `testInvalidEnumRejected` (`tst_settings_schema.cpp:111–141`), add a separate single-key patch `QVariantMap patchSearch = {{QStringLiteral("searchEngine"), QStringLiteral("yandex")}}; QVERIFY(!validateSettingsPatch(current, patchSearch).ok);` (do **not** append to the combined `theme`/`capsuleSize` `patch` at line 113, because `validateSettingsPatch` returns on the first invalid key before reaching `searchEngine`).
  - In `testWrongTypeRejected` (`tst_settings_schema.cpp:80–109`), add a separate patch `QVariantMap patch5 = {{QStringLiteral("searchEngine"), true}}; QVERIFY(!validateSettingsPatch(current, patch5).ok);`.
- No `SettingsStore`, `CoreService`, or `schemas/io.github.linuxisland.Core1.xml` change: unknown-but-allowed keys already round-trip through `GetSettings`/`UpdateSettings`.

### 2. Add the Qt URL builder with a unit test

New `island-ui/search_provider.h` / `island-ui/search_provider.cpp`:

```cpp
class SearchProvider : public QObject {
    Q_OBJECT
public:
    explicit SearchProvider(QObject *parent = nullptr);
    static QString buildUrl(const QString &engine, const QString &query);
    Q_INVOKABLE bool open(const QString &engine, const QString &query);
};
```

- `buildUrl`: trim `query`; return `QString()` when trimmed is empty or `trimmed.size() > 500`. Look up `engine` in an ordered `QMap<QString, QString>` holding the four prefixes above; unknown ids fall back to the `google` prefix. Return `prefix + QString::fromLatin1(QUrl::toPercentEncoding(trimmed))`.
- `open`: `const QString url = buildUrl(engine, query); if (url.isEmpty()) return false; return QDesktopServices::openUrl(QUrl::fromEncoded(url.toUtf8()));` Include `<QDesktopServices>`, `<QUrl>`.
- `island-ui/CMakeLists.txt`: add both files to `qt_add_executable` sources.
- New `tests/unit/tst_search_provider.cpp` (QtTest, `QTEST_MAIN`) covering:
  - Each engine with query `linux island` yields exactly `prefix + "linux%20island"`.
  - `a&b#c?d` becomes `a%26b%23c%3Fd`.
  - `"  cats  "` becomes `...q=cats`.
  - `"   "` and a 501-character query return `QString()`; a 500-character query returns non-empty.
  - Unknown engine `yandex` returns the Google URL.
- `tests/unit/CMakeLists.txt`: add `tst_search_provider` linking `search_provider.cpp`, include dir `island-ui`, libraries `Qt6::Core Qt6::Gui Qt6::Test`, `add_test(NAME search-provider COMMAND tst_search_provider)`.

### 3. Qt overlay: Search tab and page

- `island-ui/island_client.h` / `.cpp`
  - Add `Q_PROPERTY(QString searchEngine READ searchEngine NOTIFY settingsChanged)`, getter `QString searchEngine() const { return m_searchEngine; }`, member `QString m_searchEngine = QStringLiteral("google");`.
  - In `applySettingsMap` (`island_client.cpp:254–267`), add `if (settings.contains(QStringLiteral("searchEngine"))) m_searchEngine = settings.value(QStringLiteral("searchEngine")).toString();` before `emit settingsChanged()`.
  - In `IslandClient::updateSettings` (`island_client.cpp:185–197`), optimistically apply `if (patch.contains(QStringLiteral("searchEngine")) && m_searchEngine != patch.value(QStringLiteral("searchEngine")).toString()) { m_searchEngine = patch.value(QStringLiteral("searchEngine")).toString(); emit settingsChanged(); }` before the D-Bus check so engine chip selection works both when connected to `linux-island-core` and in standalone/offline mode.
- `island-ui/main.cpp`:
  - Construct `SearchProvider searchProvider;` and register `engine.rootContext()->setContextProperty(QStringLiteral("searchProvider"), &searchProvider);` next to the other providers (around line 56).
  - At line 81, resolve `IslandWindow.qml` with the same `/qt/qml` fallback used for `ThemeData.qml` (`qrc:/qt/qml/linuxisland/ui/qml/IslandWindow.qml` if `:/qt/qml/linuxisland/ui/qml/IslandWindow.qml` exists, else `qrc:/linuxisland/ui/qml/IslandWindow.qml`).
- New `island-ui/qml/SearchPage.qml` (add `qml/SearchPage.qml` to `QML_FILES` in `island-ui/CMakeLists.txt:35–42`):
  - `Item { id: root; implicitWidth: parent ? parent.width : 340; implicitHeight: 200 }`.
  - `function forceFocus() { searchField.forceActiveFocus(); }`.
  - `function submit()`: `var q = searchField.text.trim(); if (q.length === 0 || q.length > 500) return; if (searchProvider.open(islandClient.searchEngine, q)) { searchField.text = ""; islandClient.dispatchEvent("DISMISS"); }`.
  - `ColumnLayout` (`anchors.fill: parent; anchors.margins: 10; spacing: 8`):
    1. Engine chip `RowLayout` (`Layout.fillWidth: true; spacing: 4`) of four `Rectangle`s in the order Google, DuckDuckGo, Brave, Bing. Each `Layout.fillWidth: true`, `implicitHeight: 22`, `radius: 6`; active color `IslandTheme.accentPrimary` else `IslandTheme.surfaceRaised`; label font 9 bold, active text `IslandTheme.surfaceIsland`, inactive `IslandTheme.textSecondary`. `MouseArea.onClicked` calls `islandClient.updateSettings({"searchEngine": "<id>"})`. Active test is `islandClient.searchEngine === "<id>"`.
    2. `TextField { id: searchField; Layout.fillWidth: true; implicitHeight: 34; leftPadding: 10; rightPadding: 10; placeholderText: "Search the web…"; placeholderTextColor: IslandTheme.textTertiary; color: IslandTheme.textPrimary; font.pixelSize: 12; selectByMouse: true; onAccepted: root.submit(); Keys.onEscapePressed: islandClient.dispatchEvent("DISMISS") }` with `background: Rectangle { radius: 8; color: IslandTheme.surfaceRaised; border.width: 1; border.color: searchField.activeFocus ? IslandTheme.accentPrimary : IslandTheme.borderSubtle }`.
    3. `RowLayout`: `Text { text: "Enter to search · Esc to close"; font.pixelSize: 9; color: IslandTheme.textTertiary; Layout.fillWidth: true }` plus a `Rectangle` button `implicitWidth: 64; implicitHeight: 26; radius: 8; color: IslandTheme.accentPrimary`, label `"Search"` in `IslandTheme.surfaceIsland`, font 11 bold, `opacity: searchField.text.trim().length > 0 ? 1 : 0.45`; `MouseArea { anchors.fill: parent; enabled: searchField.text.trim().length > 0; cursorShape: Qt.PointingHandCursor; onClicked: root.submit() }`.
- `island-ui/qml/IslandWindow.qml`
  - Remove `Qt.Tool` from `windowRoot.flags` (`IslandWindow.qml:12` → `flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint`) so Wayland/X11 compositors permit `TextField` keyboard focus when `windowRoot.requestActivate()` is called.
  - In the segmented navigation bar (`IslandWindow.qml:246–314`), add a fourth tab `Rectangle` after Tab 2 (`AI Quota`) and before the Dismiss (`✕`) button: text `"🔍 Search"` (use compact labels or `font.pixelSize: 9` across tabs so all 4 tabs + `✕` fit inside the 280px `small`/`circle` expanded width without clipping), same active/hover styling as tabs 0–2, `MouseArea.onClicked: carouselView.currentIndex = 3`.
  - Add `SearchPage { id: searchPage }` as the fourth child of `SwipeView` (`IslandWindow.qml:340–350`).
  - Add to `carouselView` (`SwipeView`) and `islandContainer`:
    ```qml
    onCurrentIndexChanged: {
        if (currentIndex === 3 && islandContainer.isExpanded) {
            windowRoot.requestActivate();
            Qt.callLater(searchPage.forceFocus);
        }
    }
    ```
    And on `islandContainer.onIsExpandedChanged`: if `isExpanded && carouselView.currentIndex === 3`, call `windowRoot.requestActivate(); Qt.callLater(searchPage.forceFocus);` so reopening the Island directly onto the Search tab restores keyboard focus.

### 4. GJS engine helper and its Node test

New `extension/lib/searchEngines.js`:

```js
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
```

New `tests/extension/search-engines.test.js` mirroring the C++ cases: all four prefixes, `%20` spaces, `a&b#c?d` → `a%26b%23c%3Fd`, trimming, empty/501 rejected, 500 accepted, unknown id → Google, and `SEARCH_ENGINES` ids in the order above.

### 5. GNOME extension: Search page, carousel wiring, styles

New `extension/ui/searchView.js`, exporting `SearchSection`:

- Imports `St`, `Clutter`, and `{SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, buildSearchUrl}`. Same `typeof process === 'undefined'` guarded GI import pattern as `aiQuotaView.js`.
- Constructor `{engine = DEFAULT_SEARCH_ENGINE, onSearch, onEngineChanged, onDismiss, engines = SEARCH_ENGINES}`.
- Build when `St && Clutter`:
  - `actor = new St.BoxLayout({vertical: true, style: 'width: 320px; height: 98px; spacing: 6px; padding: 0 4px;', x_expand: true, y_align: Clutter.ActorAlign.CENTER})`.
  - Engine row: `St.BoxLayout({style: 'spacing: 4px;', x_align: Clutter.ActorAlign.CENTER})`; one `St.Button` per engine, `style_class: 'linux-island__search-engine-btn'`, `accessible_name: 'Search with ' + label`, child `St.Label({text: label, style: 'font-size: 10px; font-weight: 600;'})`; `clicked` calls `this.setEngine(id); this._onEngineChanged?.(id);`. Store in `this._engineButtons` keyed by id; `setEngine(id)` validates against `engines` (`const valid = this._engines.some(e => e.id === id) ? id : DEFAULT_SEARCH_ENGINE; this._engine = valid;`), and for each `[btnId, btn]` toggles `btn.add_style_class_name('linux-island__search-engine-btn--active')` when `btnId === valid` else `btn.remove_style_class_name('linux-island__search-engine-btn--active')` while preserving the base `'linux-island__search-engine-btn'` class. Call `this.setEngine(this._engine)` at the end of `_build()`.
  - Entry row: `St.BoxLayout({style: 'spacing: 6px;', x_expand: true, y_align: Clutter.ActorAlign.CENTER})` containing `this._entry = new St.Entry({hint_text: 'Search the web…', x_expand: true, can_focus: true, style_class: 'linux-island__search-entry'})`; `this._entry.clutter_text?.connect?.('activate', () => this._submit())`; `this._entry.connect('key-press-event', (_a, event) => event.get_key_symbol() === Clutter.KEY_Escape ? (this._onDismiss?.(), Clutter.EVENT_STOP) : Clutter.EVENT_PROPAGATE)`. Beside it a `St.Button` `{style_class: 'linux-island__search-action', can_focus: true, accessible_name: 'Search the web'}` with `St.Label({text: 'Search'})`, `clicked` → `this._submit()`.
  - Hint `St.Label({text: 'Enter to search · Esc to close', style_class: 'linux-island__search-hint', x_align: Clutter.ActorAlign.CENTER})`.
- `_submit()`: `const raw = typeof this._entry?.get_text === 'function' ? this._entry.get_text() : (this._entry?.text ?? ''); const url = buildSearchUrl(this._engine, raw); if (!url) return; if (typeof this._entry?.set_text === 'function') this._entry.set_text(''); else if (this._entry) this._entry.text = ''; this._onSearch?.(url);`.
- `setEngine(id)` (also callable even when `!this.actor` in headless tests so `this._engine` updates), `setWidth(width)` (sets `actor.style = 'width: ${width}px; height: 98px; spacing: 6px; padding: 0 4px;'` and `actor.width = width`), `focus()` (`this._entry?.grab_key_focus?.()`), `destroy()` (`this.actor?.destroy(); this.actor = null; this._entry = null; this._engineButtons = {};`).
Wire it into `extension/ui/mediaView.js`:

- Import `SearchSection` and `DEFAULT_SEARCH_ENGINE`.
- Constructor options (`mediaView.js:100`): add `onUpdateSettings` (default `() => {}`) and `searchEngine = DEFAULT_SEARCH_ENGINE`; store `this._onUpdateSettings = onUpdateSettings ?? (() => {});` and `this._searchEngine = searchEngine;`; initialize `this._searchSection = null;`.
- After the AI quota section (`mediaView.js:446–450`), create:
  ```js
  this._searchSection = new SearchSection({
      engine: searchEngine,
      onEngineChanged: engine => this._onUpdateSettings({searchEngine: engine}),
      onSearch: url => {
          let launched = false;
          try { Gio?.AppInfo?.launch_default_for_uri(url, null); launched = true; } catch (_) {}
          if (launched) this._onDismiss?.();
      },
      onDismiss: () => this._onDismiss?.(),
  });
  if (this._searchSection.actor) this._searchSection.setWidth(320);
  ```
- Append a fourth page to the carousel: `{id: 'search', actor: this._searchSection?.actor, label: 'Search', iconName: 'system-search-symbolic', onActivate: () => this._searchSection?.focus()}`.
- In `setCapsuleSize`, call `this._searchSection?.setWidth(Math.max(0, contentWidth - 8));` beside the AI quota width.
- Add `setSearchEngine(engine) { this._searchSection?.setEngine(engine); }`.
- In `destroy()`, call `this._searchSection?.destroy(); this._searchSection = null;` beside the AI quota teardown.

Wire through `extension/ui/capsule.js` and `extension/extension.js`:

- `capsule.js`: initialize `this._searchEngine = 'google';` before `new MediaView({...})` (around line 51); pass `onUpdateSettings: this._onUpdateSettings` and `searchEngine: this._searchEngine` into `new MediaView({...})` (`capsule.js:124–129`); add `setSearchEngine(engine) { this._searchEngine = engine; this._mediaView?.setSearchEngine(engine); }`; and inside `applyState('EXPANDED')` immediately after `this._grabHelper.grab({...})` succeeds (`capsule.js:621`), if `this._mediaView?._carousel?.currentPage === 3`, call `this._mediaView._searchSection?.focus()` so reopening the Island while on the Search page focuses the entry.
- `extension.js`: in `_onCoreStateChanged` (`extension.js:83–100`), after `setTheme`, add `if (coreState.settings.searchEngine !== undefined) this._capsule?.setSearchEngine(coreState.settings.searchEngine);`.
Carousel support:

- `extension/ui/featureCarousel.js` `getPageIcon` (`featureCarousel.js:74–81`): add `if (id === 'search' || id === 'web' || id === 'web-search') return 'system-search-symbolic';`.
- `_isInteractiveControl` class test (`featureCarousel.js:306–316`): add `curr.classes.has('linux-island__search-entry')`, `curr.classes.has('linux-island__search-action')`, `curr.classes.has('linux-island__search-engine-btn')`, and `curr.classes.has('linux-island__search-engine-btn--active')` so drags starting in the field or engine/action buttons do not swipe pages.
Styles — `scripts/dev/generate-island-css.py` (the stylesheet is generated; edit the generator, never the CSS by hand):

- Add to `BASE`:
  ```
  .linux-island__search-entry { border-radius: 10px; padding: 4px 10px; border: 1px solid transparent; }
  .linux-island__search-action { border-radius: 8px; padding: 3px 10px; border: 1px solid transparent; font-size: 11px; font-weight: 600; }
  .linux-island__search-engine-btn { border-radius: 8px; padding: 2px 8px; border: 1px solid transparent; font-size: 10px; font-weight: 600; }
  .linux-island__search-engine-btn--active { border-radius: 8px; padding: 2px 8px; border: 1px solid transparent; font-size: 10px; font-weight: 600; }
  .linux-island__search-hint { font-size: 10px; }
  ```
- Add per-theme rules to the `rules` dict in `scripts/dev/generate-island-css.py:61–110`:
  - `f'{root} .linux-island__search-entry'`: `{'background-color': colors['surface.raised'], 'border-color': colors['border.subtle'], 'color': colors['text.primary']}`
  - `f'{root} .linux-island__search-entry:focus'`: `{'border-color': colors['border.focus']}`
  - `f'{root} .linux-island__search-action'`: `{'background-color': colors['control.primary'], 'color': colors['icon.onAccent']}`
  - `f'{root} .linux-island__search-action:hover'`: `{'background-color': colors['control.primaryHover']}`
  - `f'{root} .linux-island__search-action:active'`: `{'background-color': colors['control.primaryHover']}`
  - `f'{root} .linux-island__search-engine-btn'`: `{'background-color': colors['surface.raised'], 'border-color': colors['border.subtle'], 'color': colors['text.secondary']}`
  - `f'{root} .linux-island__search-engine-btn:hover'`: `{'background-color': colors['surface.hover'], 'color': colors['text.primary']}`
  - `f'{root} .linux-island__search-engine-btn:active'`: `{'background-color': colors['surface.hover'], 'color': colors['text.primary']}`
  - `f'{root} .linux-island__search-engine-btn--active'`: `{'background-color': colors['surface.hover'], 'border-color': colors['accent.primary'], 'color': colors['accent.primary']}`
  - `f'{root} .linux-island__search-hint'`: `{'color': colors['text.tertiary']}`
- Run `python3 scripts/dev/generate-island-css.py` to rewrite `extension/stylesheet.css`.

### 6. Settings app engine selector

- `settings-app/settings_proxy.h`: add `Q_PROPERTY(QString searchEngine READ searchEngine WRITE setSearchEngine NOTIFY searchEngineChanged)`, getter `QString searchEngine() const { return m_searchEngine; }`, `Q_INVOKABLE void setSearchEngine(const QString &engine);`, signal `void searchEngineChanged();`, member `QString m_searchEngine = QStringLiteral("google");`.
- `settings-app/settings_proxy.cpp`: in `applySettingsMap` (`settings_proxy.cpp:113–158`), add the standard changed-check/emit block for `searchEngine`; implement `setSearchEngine` with `if (m_searchEngine != engine) { m_searchEngine = engine; emit searchEngineChanged(); sendPatch({{QStringLiteral("searchEngine"), engine}}); }` so UI controls stay reactive even if Core is offline (or roll back via `refresh()` on server error).
- `settings-app/qml/Main.qml`: add a "Web Search" `ColumnLayout` immediately before "Interaction Toggles" (`Main.qml:732`): bold 14 px title `Web Search` (`color: "#F4F0E9"`), 12 px description `Choose the engine used by the Island Search tab.` (`color: "#A69C8F"`), then a `RowLayout` (`spacing: 12`) of four `RadioButton`s labelled Google, DuckDuckGo, Brave, Bing; `checked: settingsProxy.searchEngine === "<id>"`, `onClicked: settingsProxy.setSearchEngine("<id>")`.
### 7. Update renderer/carousel tests with the new page

- `tests/extension/capsule-rendering.test.js`
  - Import `{SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, buildSearchUrl} from '../../extension/lib/searchEngines.js';` at the top of `capsule-rendering.test.js` and attach `SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, buildSearchUrl, launchedUris: []` to `globalThis.renderTest`.
  - Extend `Actor` (`capsule-rendering.test.js:10–43`):
    - Initialize `this.text = props.text ?? '';` in `constructor`.
    - Add `get_text() { return this.text; }`, `set_text(t) { this.text = t; }`, and `grab_key_focus() { this.focused = true; }` on `Actor`.
    - Extend `this.clutter_text` on `Actor` (`line 14`) to `{handlers: {}, set_ellipsize() {}, connect(name, fn) { this.handlers[name] = fn; return name; }}`.
  - Extend `globalThis.renderTest.St` (`line 71`) with `Entry: Actor` and `globalThis.renderTest.Gio` (`line 73`) with `AppInfo: {launch_default_for_uri(uri) { globalThis.renderTest.launchedUris.push(uri); return true; }}`.
  - Load `extension/ui/searchView.js` in the harness before `mediaView.js`: replace `import .*searchEngines.*;` with `const {SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE, buildSearchUrl} = globalThis.renderTest;`, replace `let St = null;` and `let Clutter = null;`, export `SearchSection` onto `globalThis.renderTest`, and in `mediaSource` (`line 130`) replace `^import .*searchView.*;$` with `const {SearchSection, DEFAULT_SEARCH_ENGINE} = globalThis.renderTest;`.
  - Update carousel assertions (`capsule-rendering.test.js:211–249`): change `pageCount` and `_navButtons.length` from `3` to `4`; assert `_navButtons[3].child.icon_name === 'system-search-symbolic'`; assert `!carousel._navButtons[3].classes.has('linux-island__section-btn--active')` initially; after clicking `_navButtons[2]`, click `_navButtons[3]` and assert `carousel.currentPage === 3` and `_navButtons[3]` has `'linux-island__section-btn--active'` while `0..2` do not.
  - Assert `capsule._mediaView._searchSection` exists; set `search._entry.set_text('linux island')`, call `search._submit()`, and assert `globalThis.renderTest.launchedUris.at(-1) === 'https://www.google.com/search?q=linux%20island'` and `search._entry.get_text() === ''`.
  - Click the DuckDuckGo engine button (`search._engineButtons.duckduckgo.handlers['clicked']()`), assert `search._engine === 'duckduckgo'` and `search._engineButtons.duckduckgo.classes.has('linux-island__search-engine-btn--active')`; call `capsule.setSearchEngine('brave')` and assert `search._engineButtons.brave.classes.has('linux-island__search-engine-btn--active')` and `!search._engineButtons.duckduckgo.classes.has('linux-island__search-engine-btn--active')`.
- `tests/extension/feature-carousel.test.js`: add `assertEqual(getPageIcon({id: 'search'}), 'system-search-symbolic');` (`line 77`) and add `_isInteractiveControl` assertions (`line 121`) for `'linux-island__search-entry'`, `'linux-island__search-action'`, `'linux-island__search-engine-btn'`, and `'linux-island__search-engine-btn--active'`.

## Critical files & anchors

- `extension/ui/mediaView.js` — `_buildUi()` carousel page list at lines 446–486; `setCapsuleSize` at lines 539–593; `destroy()` at lines 735–772.
- `extension/ui/featureCarousel.js` — `getPageIcon` at lines 74–81 and `_isInteractiveControl` at lines 296–320.
- `island-ui/qml/IslandWindow.qml` — window flags at line 12, segmented tab bar at lines 234–337, and `SwipeView` at lines 340–350.
- `core/settings/settings_schema.cpp` — `defaultSettings()` and `allowedKeys` at lines 4–34; enum validation at lines 75–128.
- `scripts/dev/generate-island-css.py` — `BASE` string (lines 8–53) and per-theme `rules` dict (lines 61–110); `extension/stylesheet.css` is generated output.
## Verification

Prerequisites: repository root, Qt 6 dev packages already used by the existing build, Node.js, Python 3. Run in this order.

1. **Build** — `cmake --preset dev && cmake --build build/dev`; expect exit 0.
2. **C++ tests** — `ctest --test-dir build/dev --output-on-failure`; expect all tests pass, including new `search-provider` and updated `settings-schema`.
3. **GJS pure tests** — `node tests/extension/search-engines.test.js`; expect `PASS` for every case (Google/DuckDuckGo/Brave/Bing prefixes, `%20`, `%26%23%3F`, trim, 500/501 boundary, unknown → Google).
4. **Renderer regression** — `node tests/extension/feature-carousel.test.js && node tests/extension/capsule-rendering.test.js`; expect both `PASS`, with four section buttons, the search icon, and the simulated search launching `https://www.google.com/search?q=linux%20island` then switching to DuckDuckGo/Brave.
5. **Generated CSS** — `python3 scripts/dev/generate-island-css.py --check`; expect `PASS: scoped Island CSS matches both approved theme exports`.
6. **Qt smoke** — `build/dev/island-ui/linux-island-ui --smoke-test`; expect `PASS: linux-island-ui smoke check` and exit 0 (search page must not break QML loading).
7. **Qt end-to-end** — from the repo root run `packaging/bin/linux-island-launch --standalone`, expand the Island, open the fourth tab (`🔍 Search`), type `linux wayland`, press Enter. Expect the default browser to open `https://www.google.com/search?q=linux%20wayland` and the Island to collapse. Reopen, switch the engine chip to DuckDuckGo, search again: expect `https://duckduckgo.com/?q=...`. Close and relaunch the overlay: the DuckDuckGo chip is still active.
8. **Settings sync** — open `linux-island-settings`, choose Brave under Web Search, then reopen the Island Search tab: the Brave chip is active without restarting the overlay.
9. **GNOME extension** — only in an isolated test user/VM per `AGENTS.md` (never the daily-use Shell): enable `linux-island@local`, expand, open the Search icon tab, type `linux island`, press Enter. Expect the default browser to open `https://www.google.com/search?q=linux%20island`, the Island to collapse, and no `linux-island` exceptions in `journalctl --user -b`. If no isolated session is available, record this step as **NOT_RUN** with the automated evidence from steps 3–5.

## Assumptions & contingencies

- Default engine is Google; the user can change it from the Island chip or Settings, and the choice persists in `~/.config/linux-island/settings.json` as `"searchEngine"`.
- In GNOME runtime testing, `Capsule.applyState('EXPANDED')` grabs focus onto `this._widget` via `this._grabHelper.grab(...)`; calling `this._mediaView._searchSection?.focus()` immediately after a successful grab when `currentPage === 3` ensures `St.Entry` receives keystrokes without adding a second grab.
- Removing `Qt.Tool` from `IslandWindow.qml` (`flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint`) and calling `windowRoot.requestActivate()` when the Search tab is active ensures Wayland/X11 compositors route keystrokes into `searchField`.
