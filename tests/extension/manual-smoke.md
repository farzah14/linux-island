# GNOME 46 Wayland manual acceptance — M0

**Environment required:** an isolated Ubuntu 24.04/GNOME 46 Wayland VM, disposable test user, or a dedicated test machine with a recoverable session. Do **not** run against a primary daily-use GNOME Shell session for the initial spike.

## Prerequisites
1. Record output of `gnome-shell --version`, `echo "$XDG_SESSION_TYPE"`, `gnome-extensions version`, and `journalctl --user -b --no-pager | tail -n 30`.
2. Copy `extension/` contents into `$HOME/.local/share/gnome-shell/extensions/linux-island@local/` with `metadata.json` directly inside that destination.
3. Restart the **test** GNOME session if a newly installed extension does not appear; do not force-restart GNOME Shell on Wayland.

## Tests (not yet executed)
- [ ] `gnome-extensions info linux-island@local` discovers extension.
- [ ] `gnome-extensions enable linux-island@local` displays one center-panel capsule.
- [ ] `gnome-extensions disable linux-island@local` removes the capsule.
- [ ] Enable/disable ten times; verify no duplicate actor, error, or Shell instability.
- [ ] Fullscreen a video player on primary monitor; verify capsule is hidden (`FULLSCREEN_ON`); exit fullscreen; verify capsule restored to `COMPACT` (`FULLSCREEN_OFF`).
- [ ] Switch workspaces and return; watch the capsule's lifetime.
- [ ] `journalctl --user -b` shows no Linux Island-caused GNOME Shell exceptions.
- [ ] Confirm rollback by disabling the extension or removing only `linux-island@local` from the disposable test user.

## Evidence
Record GNOME version, compositor/session type, screenshot, 10-cycle enable/disable result, fullscreen behavior, relevant journal lines, and any compatibility deviations in `docs/compatibility.md`.

---

## GNOME 50.1 Compatibility Assessment (M0-02)

**Host Environment:** Ubuntu 26.04.1 LTS (x86_64), GNOME Shell 50.1, GJS 1.88.0, Wayland.

### Code Audit Findings
1. **Extension Lifecycle:** `Extension` ESM base class (`resource:///org/gnome/shell/extensions/extension.js`) and lifecycle hooks (`enable()`, `disable()`) match GNOME 50 specifications.
2. **Capsule UI & Panel Integration:** `Main.panel.addToStatusArea(role, indicator, position, box)` in GNOME 50 requires `PanelMenu.Button` and automatically disconnects and cleans `Main.panel.statusArea[role]` when the indicator actor is destroyed. The M0 capsule implementation adheres strictly to this contract.
3. **UI Elements:** `St.BoxLayout`, `St.Label`, and `Clutter.ActorAlign.CENTER` remain available in GNOME 50 Mutter/St typelibs (`libst-18.so`, `libshell-18.so`).
4. **Review Guidelines:** No actors or side effects are instantiated at module import time; instantiation occurs strictly within `enable()`, and full destruction occurs within `disable()`.

### Runtime Acceptance Status: BLOCKED (Awaiting User Environment Authorization)
- **Observed Environment:** The active workstation session is a primary daily-use GNOME Shell 50.1 desktop.
- **Constraint:** Per `AGENTS.md` and safety guidelines, extensions must never be installed or enabled in a primary daily-use GNOME session.
- **Prepared Test Staging Package:** `build/test-compat-gnome50/linux-island@local.shell-extension.zip` (staged copy with `"shell-version": ["46", "50"]`; repository source `extension/metadata.json` remains strictly `"46"`).
- **Recommended Procedure (Dedicated User):**
  1. Create test user: `sudo useradd -m -s /bin/bash gnometest && sudo passwd gnometest`
  2. Switch to GDM login screen and log into GNOME Wayland as `gnometest`.
  3. Install and test:
     ```bash
     gnome-extensions install /path/to/linux-island/build/test-compat-gnome50/linux-island@local.shell-extension.zip
     gnome-extensions enable linux-island@local
     # Verify single center capsule
     gnome-extensions disable linux-island@local
     # Verify capsule removed
     # Execute 10-cycle enable/disable test
     for i in {1..10}; do
         gnome-extensions enable linux-island@local
         sleep 0.5
         gnome-extensions disable linux-island@local
         sleep 0.5
     done
     # Check logs
     journalctl --user -b -o cat /usr/bin/gnome-shell | grep -i "linux-island"
     # Uninstall
     gnome-extensions uninstall linux-island@local
     ```
  4. Rollback: Log back into `farzah` and remove test user: `sudo userdel -r gnometest`.
- **Status:** BLOCKED pending user authorization and execution of isolated test user session.

# Media-card layout and motion regression (2026-10-25)

Run in an isolated GNOME 46 Wayland test account or VM. Status: **NOT_RUN**.

- Play a compatible MPRIS source, expand Island, and compare title, artist and play/pause status with the player. Never copy song metadata into logs.
- Confirm the 48 px placeholder, aligned track text, header close target and centered 40 px transport targets; long titles must ellipsize inside the card. Check 100%, 125% and 200% scaling and panel overlap.
- Expand/collapse repeatedly: short 220 ms fade/scale transitions should replace previous transitions, with no queued motion or drifting from the primary-monitor center.
- Hover directly over each edge of the compact pill and hold the pointer still. COMPACT/PREVIEW must keep the same padding and unscaled, opaque text; no repeated enter/leave flicker. Expand/collapse transitions remain enabled. Regression added after a user blur report; live verification remains NOT_RUN.
- Disable Smooth Animations in Settings while transitioning: finish immediately at full opacity/scale. Re-enable it. Disable GNOME animations and repeat: no motion.
- Enter fullscreen during a transition: hide immediately; leave fullscreen: recover compact. Disable extension during a transition: no callbacks or actors remain.
- Stop Core: expanded card and compact label show `Core offline`, controls become dimmed/nonfocusable. Restart Core: song details and capabilities recover without restarting Shell. With Core running but no player, show `No Media Playing` instead.

## Compact card and artwork (2026-10-25)

Approved smaller layout replaces the previous expanded minimum-height target.
Status: automated renderer/file validation PASS; live layout acceptance NOT_RUN.

- Expand: expect approximately 300 px total width, content-driven height, no large empty area beneath metadata; check long titles at 100%, 125% and 200% scale.
- Previous/Next use matching 40 px buttons with centered 16 px symbolic icons, 8 px gaps, and a 48-by-40 px Play/Pause button. Verify each action and disabled state.
- Play tracks with different local artwork. Thumbnail must change with the current track; rapid switches must not restore an older thumbnail. Missing or invalid artwork shows the music placeholder.
- Disconnect/restart Core and disable the extension while artwork is loading. No stale image, callbacks on destroyed actors or Shell errors.
- Automated file checks: `gjs -m tests/extension/local-artwork.gjs.js` verifies valid PNG, corrupt/missing/oversized/remote/symlink/oversized-dimension rejection and cancellation. Foreign ownership is checked in the loader, but not synthesized in the unprivileged fixture.

## Wider, shallower card and outside dismissal (2026-10-25)

This approved revision supersedes the earlier 300 px/40 px button targets.
Target: approximately 360 by 110 logical pixels, two rows (artwork/text/close,
then controls), 32 px button height and 8 px control gaps.

Live runtime status: **NOT_RUN**. Verify on an isolated GNOME Wayland session:

- Open the card, click elsewhere on a window, desktop or dock: collapse to compact. The first outside click dismisses the card without replay into another application, like a native GNOME menu. A subsequent click interacts normally.
- Clicking Play/Pause/Previous/Next inside must preserve expansion and control playback; clicking Close or pressing Escape collapses and restores prior keyboard focus.
- Repeat opening/dismissing, enter fullscreen while expanded, disable during an animation, and simulate a rejected modal grab: no input grab survives and desktop input remains usable.
- Check title ellipsis and the shorter card at 100%, 125% and 200% scaling. Thumbnails and hover stability must remain intact.

Uses only public `GrabHelper` constructor, `grab` and `ungrab`, verified in the
official GNOME 46 source and installed GNOME 50.1 source. Actor-double regression
proves renderer wiring/lifecycle only, not real compositor input delivery.

Latest visual revision: user requested removing the X button and the expanded
outline. Track row now contains only artwork and metadata; expanded border is
transparent to preserve geometry. Outside-click and Escape remain dismissal
paths. This supersedes the Close-button checks above. Renderer regression,
syntax and token QA PASS; live visual acceptance remains NOT_RUN. Updated
mediaView.js and stylesheet.css installed with backup and SHA-256 comparison;
new JavaScript awaits a fresh session.

## Playback beat bars (2026-10-25)

Live visual status: **NOT_RUN**. Three small amber bars beside the title are a
playback-driven effect, not an audio waveform. Verify compact and expanded:

- Play: bars rise/fall independently; track text and pill hitbox stay steady.
- Pause: bars stop. No player/Core disconnect: indicator disappears.
- Hover or refresh unchanged media: no animation restart or text resampling.
- Disable app animations or GNOME animations during playback: bars stop immediately; re-enable to resume.
- Collapse/expand/fullscreen: only mapped indicators animate. Disable mid-playback: no orphan transitions or settings listeners.

## Real speaker spectrum replaces the decorative loop (2026-10-25)

Supersedes the playback-only beat description above. Core now supplies optional
`audioLevels` (bass/mids/treble, normalized 0..1) through the existing media
dictionary. Core1 XML signatures remain unchanged. PipeWire captures only the
explicit default speaker sink with monitor capture and microphone fallback OFF;
no PCM/audio file or metadata logs. Other desktop audio can affect the display.

- Play music and observe three independent heights; quiet passages/silence settle the bars. Pause must reset them; missing levels must never trigger a fabricated repeat loop.
- Toggle app/desktop animations: motion stops. Hide, expand/collapse or disable: mapped values/lifecycle remain correct. Text never scales with beat levels.
- Switch audio outputs: resolver retargets within roughly two seconds. Missing tools/sinks/capture failures degrade to settled bars, with no microphone fallback.
- Opt-in live meter test: `LINUX_ISLAND_TEST_LIVE_AUDIO=1 build/dev/tests/unit/tst_audio_meter liveMonitor`. It measures speaker output in memory without storing PCM. Run only when speaker-output capture is authorized.

Synthetic band tests and real monitor routing PASS on the host. Actual visual
response after a new session and GNOME 46 Wayland acceptance remain NOT_RUN.

## Live Island themes (2026-10-25, M3-14C)

After loading the new extension in an isolated session, change Appearance Theme
in Settings between Light/Dark/System. Island updates without a Shell restart:

- Check compact pill, expanded card, title/artist, placeholder, transport controls and beat bars against approved light/dark tokens. Existing expanded outline remains transparent and the X stays removed.
- Change theme while expanded, hidden and during playback: no collapse, loss of artwork, loss of audio levels or new input grab.
- System follows `org.gnome.desktop.interface color-scheme` live. `prefer-dark` selects dark; `prefer-light`/`default` select light. Explicit Light/Dark ignore desktop changes.
- Restart Core: persisted preference returns; disable extension: no remaining system-theme settings listener or extension stylesheet.

CSS is generated with `python3 scripts/dev/generate-island-css.py`; check it with
`--check` after changes to token exports. Installed GNOME St.Theme parsing and
automated renderer tests PASS; actual GNOME 46 visual acceptance NOT_RUN.
This step themes the Island; QML Settings-window appearance remains M4-16B work.

## Live capsule size (2026-10-25)

Small/Medium/Large in Settings should update the Island without a Shell restart
after loading the new extension once. Approximate expanded widths 300/360/420 px;
artwork 40/48/56 px; transport heights 28/32/36 px. Medium preserves the current
shallow card. Compact font, padding and title truncation also respond. Geometry
is resized directly, not through an actor scale transform.

Live status **NOT_RUN**: change sizes during playback and while expanded/hidden;
verify no collapse or fullscreen leak, title stays sharp/ellipsized, artwork and
icons remain aligned, theme and outside dismissal persist, and the saved choice
returns after Core restart. Check 100%, 125% and 200% display scaling.

## Live interaction toggles (2026-10-25)

Status: automated renderer/controller checks PASS; live GNOME acceptance NOT_RUN.

- Turn Hover Preview OFF: pointer entry/exit no longer changes COMPACT/PREVIEW. If preview is open, it closes. Clicking the capsule must still expand it and outside-click/Escape still dismiss it.
- Turn Hover Preview ON while pointer is already over a compact capsule: preview activates without requiring pointer movement. Toggling hover while expanded or hidden must not dismiss expansion or reveal a fullscreen-hidden capsule.
- While fullscreen, turn Smart Adaptive OFF: the Island returns to compact. Turn it ON: hide immediately, including when the card is expanded. Unknown display information stays hidden when enabled.
- Change both preferences together: fullscreen policy is applied first and wins over hover. Restart Core and confirm persisted preferences return. Disable extension and confirm input/signal cleanup.

## Playback timeline (2026-10-25)

Status: automated clock/rendering and fake-MPRIS seek checks PASS; live visual
GNOME 46 acceptance NOT_RUN. Timeline is read-only; transport controls unchanged.

- Expand during playback: a 4 px themed bar and elapsed/total labels appear. Local position advances from Core's monotonic sample and rate; frequent beat updates must not reset it.
- Pause freezes progress. Seeking in the music app, track/player changes, rate changes and reopening the card resynchronize from MPRIS. Opening must not restore older media/settings over newer signals.
- Unknown duration hides the bar and shows `--:--` for total; no player/Core offline clears progress. Position stays within duration; long times ellipsize rather than widening the card.
- Small/Medium/Large and Light/Dark/System retain aligned controls and matching track/fill colors. No draggable seek UI is introduced.
- Collapse/fullscreen/unmap or pause cancels the 250 ms UI timer. Disable while playing leaves no timer or callback on destroyed actors.

Optional media field `positionSampleUs` uses the host monotonic clock; frozen
Core1 XML methods/signals are unchanged. Native MPRIS queries remain asynchronous
from the Shell's perspective; sampling and metadata are never logged.
