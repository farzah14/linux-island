# Development Without Logout

Operational guide for changing Linux Island without ending your desktop session.

> **Scope of claims.** Everything marked *verified* was executed on
> Ubuntu 26.04.1 / GNOME Shell 50.1 / Wayland / Qt 6.10.2 on 2026-10-30.
> GNOME 46 (the official acceptance target) was **not** tested here.
> Items marked *unverified* are documented behaviour, not project evidence.

## 1. Why logout is normally needed

GNOME Shell caches ES modules per URL for the lifetime of the shell process.
`ReloadExtension` over D-Bus is deprecated in GNOME 49+ and returns
`Method ReloadExtension is not implemented`; `--nested` was removed in GNOME 49;
`Alt+F2` → `r` no longer exists (the run dialog only exposes `lg`, `debugexit`,
`rt`). Verified by reading `libshell-18.so` and by calling the D-Bus method.

CSS is different: stylesheets *are* reloaded on every extension enable/disable.

## 2. Three tiers

> **What "reload extension" actually is.** It re-imports the extension from a
> fresh directory through an **experimental loader extension**. It is not an
> official GNOME reload. Verified limits: old modules stay in the interpreter,
> RSS grows ~0.9 MB per reload, UI state resets, and a loader UUID added to a
> running shell is invisible until that shell restarts.

| What you change | Use | Loop time (measured) | Logout |
|---|---|---|---|
| Extension JS or CSS | `dev.sh reload extension` (dev session, experimental loader) | ~1.1–1.4 s | No |
| CSS only, daily session | `dev-reload.sh reload` (loader) | ~1 s | No |
| QML / Qt overlay | `cmake --build build/dev --target linux-island-ui` | 5.9 s | No |
| Core C++ | `dev.sh reload core` | build + new `instanceId` | No |
| `metadata.json`, packaging, Core1 schema | new shell process | — | Yes / test account |

## 3. Recommended workflow

```bash
# once per boot
scripts/dev/dev.sh preview          # isolated shell, private bus, private dconf
scripts/dev/dev.sh status           # wait until it reports readiness

# inner loop
scripts/dev/dev.sh reload extension --target dev-session
scripts/dev/dev.sh reload css       --target dev-session
scripts/dev/dev.sh rollback         --target dev-session
scripts/dev/dev.sh stop
```

`doctor` is read-only and tells you what is missing:

```bash
scripts/dev/dev.sh doctor
```

### Visible desktop on GNOME 49+

`mutter-devkit` is **not packaged in Ubuntu** (`/usr/libexec/mutter-devkit` is
absent and there is no apt candidate). `--devkit` therefore cannot render a
window here, and `--nested` no longer exists.

`dev-session.sh` detects this and degrades to `--headless`, which still runs a
real shell that loads extensions, but has no visible surface. For a *visible*
test desktop without logging out, use **Switch User** (a second GNOME session on
another VT) with a test account.

Verified: headless session loads `linux-island@local` to `State: ACTIVE` with no
extension errors.

## 4. Isolation guarantees

`dev-session.sh` sets, for the child process only:

- `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_RUNTIME_DIR`
- `DCONF_PROFILE` pointing at a private dconf profile
- a private `dbus-run-session` bus, published to `$STATE/bus-address`
- its own Core instance on that private bus

Verified: writing `org.gnome.shell enabled-extensions` inside the isolated
environment does **not** modify the primary `~/.config/dconf/user`.

**Caveat found during development:** running a bare `gnome-shell --headless`
*without* these variables writes to your real dconf. Always go through
`dev-session.sh` or `dev.sh preview`.

## 5. Loader limits (measured)

| Claim | Evidence |
|---|---|
| New JS is picked up | `generation N ready from <new dir>` after each reload |
| Imported modules update too | marker in `lib/systemMetrics.js` appeared in shell log |
| CSS reloads | stylesheet loaded after successful import, unloaded on disable |
| Repeated reloads work | 20 consecutive cycles, 22 ready generations, no JS errors |
| Memory is **not** flat | RSS 245 MB → 255 MB over 10 reloads (~0.9 MB/cycle) |
| Syntax errors are caught | `exit 1`, previous good generation restored automatically |

Consequences:

- Old modules are never unloaded from the interpreter. Only the entry module is
  re-imported. Deep type/resource leaks are **not** fixable by this tool.
- UI state resets on every reload (timers, hover, expansion).
- After a long session of reloads, restart the dev shell rather than trusting it.

## 6. Failure handling

`reload extension` reports success only after the loader logs readiness for the
generation it just staged. `reload core` reports success only after
`GetSnapshot` returns an `instanceId` different from the one captured before the
restart — a live D-Bus name alone is explicitly not accepted as readiness.

On failure it:

1. prints the loader error,
2. restores the last generation that reached readiness,
3. exits non-zero.

If recovery also fails, restart the dev session (`dev.sh stop` then `preview`).
Never restart your primary shell to fix a dev-session problem.

## 7. Things this does not cover

### Running on a different GNOME version

GNOME marks an extension `OUT_OF_DATE` unless `shell-version` in `metadata.json`
contains a string starting with the running major version. The audited list in
`extension/metadata.json` is `["46", "50"]`; anything else (47, 48, 49, 51, …)
would silently load nothing.

Both staging paths therefore call `scripts/dev/stage-metadata.py`, which adds the
**host** major to the throwaway copy only:

```text
extension/metadata.json                      ["46", "50"]        (audited, unchanged)
$STATE/.../linux-island@local/metadata.json  ["46", "50", "48"]  (staged for GNOME 48)
```

`dev.sh doctor` reports both the host version and the audited list, and says
explicitly whether they match. Adding a version only lets the shell *try* to
load; it is not a compatibility claim.

What still differs between versions, and is **not** handled by the tooling:

| Area | Risk on other versions |
|---|---|
| Shell mode | `--nested` removed in 49; `--devkit` needs `mutter-devkit`, absent on Ubuntu |
| Shell APIs | `PanelMenu.Button`, `Main.layoutManager`, `global.display` signals can change |
| Extension internals | `notificationAdapter` / WhatsApp integration depend on Shell internals |
| Acceptance | GNOME 46 remains the only audited target in `AGENTS.md` |

If a version is not audited, treat every reload as a *load* test, not a
compatibility test. Use a test account for anything you intend to claim.

### Other limits

- `dev-session.sh stop` removes the whole state directory (bus address, staged
  tree, logs). GVFS subdirectories are retried with a permission fix; if removal
  still fails, the leftover path is reported instead of silently ignored.
- `metadata.json` changes (uuid, `shell-version`) require a shell that scans the
  UUID at startup. A loader UUID added to an already-running shell is invisible:
  `gnome-extensions enable` returns `Extension ... does not exist`.
- Core1 schema changes: the contract is frozen and verified by `dbus-schema`.
- GNOME 46 acceptance: requires a test user or VM per `AGENTS.md`.
- Visual confirmation in headless mode: `grim` needs `wlr-screencopy`,
  `Shell.Screenshot` is denied, and `Eval` is disabled. Headless proves *load*,
  not *appearance*.

## 8. Tests

```bash
python3 tests/integration/test_dev_session.py   # mode selection, stop safety
python3 tests/integration/test_dev_cli.py       # CLI contract
node tests/extension/dev-loader.test.js         # generation logic
ctest --test-dir build/dev -R "dev-session|dev-cli" --output-on-failure
```

`tests/extension/dev-loader.test.js` imports `scripts/dev/dev-loader-extension.js`
— the same file that is installed as the loader — with `gi://` and Shell modules
stubbed. It covers: successful load, CSS applied only after a successful import,
failed import leaves no CSS, refusal to load outside the stage root, disable
during a slow import, two rapid enables, stylesheet unload, missing pointer,
missing stylesheet.

These validate tooling logic. They are **not** GNOME compatibility evidence.

## 9. Test account for visible evidence

A second GNOME account on the same host gives a *visible* desktop without
logging out of the primary session. It does not prove GNOME 46 compatibility —
that needs a VM with Ubuntu 24.04.

Setup performed on this host (2026-10-30):

```text
user      islandtest (uid 1001)
password  stored at /tmp/islandtest-cred.txt (mode 0600)
project   /opt/linux-island-dev (world-readable copy; $HOME/farzah is 0750)
install   packaging/dev/install-local.sh run as islandtest
dconf     enabled-extensions = ['linux-island@local']
```

Verified before login: a headless shell for `islandtest` loads the extension to
`State: ACTIVE`.

### Capture evidence

Inside the test session, open a terminal and run:

```bash
/opt/linux-island-dev/scripts/dev/capture-visual.sh
```

It writes `~/island-evidence/report.txt` plus four PNGs (compact, expanded,
system page, AI quota page) and records shell version, extension state, Core
`instanceId`, and monitor geometry. It is read-only apart from the PNGs.

### What the test account does NOT give you

- GNOME 46 behaviour (host is a different version)
- Frame-level animation smoothness
- Proof that clicks outside the capsule pass through (needs a manual click test)
