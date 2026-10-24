# Compact card and local artwork implementation plan

**Approved goal:** A roughly 300 px expanded card without forced empty height, equal Previous/Next controls with centered symbolic icons and 8 px gaps, and a 48 px track thumbnail. Keep the Warm Minimalist palette, existing motion behavior and immutable Core1 contract.

**Architecture:** MediaView loads only player-provided local artwork asynchronously. Validate local URI, regular file, owner, byte size and decoded dimensions before giving a FileIcon to St. Cancel outstanding requests and reject stale completions on track switch, disconnect or destruction. Missing/invalid artwork uses the music placeholder. No remote artwork downloads and no Core changes.

**Scope:** M2-13A media renderer step; `extension/ui/mediaView.js`, new `extension/lib/localArtwork.js`, renderer regression and GJS artwork integration test, plus manual smoke documentation. The loader is a dependency needed to implement the vetted local artwork policy without tying filesystem checks to layout code.

- [x] RED renderer tests: compact width, content-driven height, equal buttons, thumbnails update, stale results ignored, fallback and cancellation.
- [x] RED GJS integration test: valid PNG must load; negative cases cover missing, oversized, remote, symlink, corrupt and excessive dimensions. Ownership check implemented; foreign-owned fixture NOT_RUN.
- [x] Minimal implementation using existing Gio/GdkPixbuf/St; no added packages.
- [x] GREEN all Node renderer/logic tests, GJS local artwork tests, token QA and diff check.
- [x] Back up the installed extension and copy only changed/new source files; hash-verify installation and preserve metadata. Do not log out or reload Shell.

Live layout, cropping, scaling and icon appearance on GNOME 46 Wayland remain NOT_RUN until an isolated runtime check. Installation is authorized by the user's approved update; no merge, push or tag.

## Evidence

- RED `node tests/extension/capsule-rendering.test.js`, exit 1: `AssertionError: compact card content width` (old width 324, expected 268 content pixels).
- New GJS test initially failed on missing loader. With a temporary no-op loader, behavioral RED exit 1 confirmed `valid owned PNG must load`; restored the implementation immediately.
- GREEN renderer regression: exit 0. Verifies matched button dimensions/icons, compact width without forced height, artwork replacement, stale callback rejection, disconnect fallback and destruction cancellation.
- `gjs -m tests/extension/local-artwork.gjs.js`, exit 0: `PASS: valid local artwork, URI/file/dimension limits, symlink rejection and cancellation`. The initial nested-main-loop test harness stalled; top-level await fixed the harness. The stalled test process was terminated.
- All seven Node test files: PASS, exit 0. All six existing GJS logic suites: PASS, exit 0.
- Token validation: 26 contrast checks, exit 0. Warm palette: 3 tests, OK, exit 0. JavaScript syntax and `git diff --check`: exit 0.
- Real Core snapshot artwork check: `{"coreResponding":true,"hasPlayer":true,"hasArtworkUri":true,"validatedArtwork":true}`. This proves current local artwork is accepted, not that the new renderer is loaded in Shell.
- Installed `lib/localArtwork.js` and `ui/mediaView.js`, SHA-256 verified. Full previous extension backup: `/home/farzah/.local/state/linux-island/backups/compact-artwork-20261024T184008.270853Z`.
- Core remains `active`. Existing installed metadata preserved. Shell was not reloaded; a fresh session is needed to load the installed update.

Environment: GNOME Shell 50.1 / Wayland, GJS 1.88.0. St Icon gicon/fallback properties, Button set_child, and GdkPixbuf asynchronous file-info APIs verified locally. GNOME 46 runtime remains NOT_RUN. Thumbnail support is local PNG/JPEG/WebP, regular files owned by the user, up to 4 MiB and 4096 px per dimension; unavailable art keeps the placeholder.
