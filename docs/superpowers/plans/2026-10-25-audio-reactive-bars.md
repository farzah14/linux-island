# Real speaker-output spectrum bars

Approved replacement for decorative loops: bass/mids/treble measured from speaker
output, settling on silence and pause. No microphone, file recording or audio logs.
Desktop sounds can affect the meter. Respect app motion preference and live GNOME
reduced motion. Existing layout and thumbnail behavior stay unchanged.

Vertical scope requires Core + renderer: new Qt Core audio meter,
Core service levels setter, app wiring, CMake/test target, BeatBars plus its two
callers, and renderer regression. Core1 XML stays byte-for-byte unchanged; add
optional `audioLevels` (three normalized doubles in a variant array) inside the
existing media dictionary/MediaChanged signal. The user-approved feature extends
the dictionary, not the six method/three signal signatures.

Use existing `wpctl` to resolve/validate the default Audio/Sink; `pw-cat` captures
only that explicit sink with `stream.capture.sink=true` and no fallback. Commands
use QProcess argument arrays, never shell evaluation. 16 kHz mono s16 frames
of 800 samples (50 ms), bounded RAM buffer, three filtered RMS bands, bounded
normalized levels. Stop capture on pause or app animations OFF. Retry/retarget
asynchronously. No new packages. No blocking D-Bus in Shell callbacks.

1. RED synthetic PCM tests: silence, low/mid/high tone ordering, malformed bytes.
2. RED renderer tests: actual supplied levels, no infinite repeat, safe silence.
3. Implement minimal meter and additive dictionary delivery; preserve lifecycle.
4. Run native build/CTest, Node and GJS regressions, frozen XML/token/diff gates.
5. Verify live PipeWire links go only to sink monitor; check changing bounded
   levels without logging/retaining PCM. Install Core/UI with backups and hashes.

Official PipeWire docs: https://docs.pipewire.org/page_man_pw-cat_1.html and
https://pipewire.pages.freedesktop.org/pipewire/devel/group__pw__keys.html .
No automatic logout or Shell reload. Live GNOME 46 visual acceptance remains
NOT_RUN. Core/system audio routing and visual acceptance are distinct gates.

## Results

- DSP bootstrap RED: CMake failed for missing audio_meter.h. Behavioral DSP checks then passed: silence, malformed frame, 100 Hz / 1 kHz / 6 kHz dominant bands, bounds and decay to silence.
- Renderer RED: `node tests/extension/capsule-rendering.test.js`, exit 1: `actual band levels control heights`. GREEN exit 0 after replacing infinite repeat with direct normalized scale values. Tests cover updated levels while Playing, missing/invalid data, pause, mapping, app setting, live reduced motion and cleanup.
- Initial inline QObject implementation failed MOC/link generation; separating declaration and implementation into audio_meter.h/.cpp fixed it. Native build now succeeds. CMake configuration retains existing unrelated Qt/QML policy/plugin warnings.
- Initial live capture failed (`defined target not found`): WirePlumber could reject the new explicit-target stream before linking. Added node.linger=true while retaining explicit validated Audio/Sink target, stream.capture.sink=true and node.dont-fallback=true. This waits safely instead of falling back to a microphone.
- Live opt-in test: `LINUX_ISLAND_TEST_LIVE_AUDIO=1 build/dev/tests/unit/tst_audio_meter liveMonitor`, exit 0: 3 passed, 0 failed. Samples processed only in memory; bounded 3-band frames delivered; children stopped after deactivation.
- Independent PipeWire graph inspection during live test: two incoming links, both from speaker monitor ports; no Audio/Source link. Probe streams removed after process exit.
- All 8 CTest suites pass, including Core level/revision validation and frozen schema. All 7 Node test files, six GJS logic files, and local artwork GJS test pass. Token QA: 26 checks pass. Diff check and frozen XML diff: exit 0.
- Installed Core binary plus beatBars.js/mediaView.js/capsule.js with SHA-256 comparison and metadata preservation. Backup: `/home/farzah/.local/state/linux-island/backups/audio-reactive-20261024T195513.990855Z`.
- Restarted only Core; `systemctl --user is-active linux-island-core.service` => active. Real snapshot exposes audioLevels with 3 bands. Player was paused at verification, so no claim of visually observed music-reactive motion.

Fresh GNOME session required for new renderer. Live visual response / GNOME 46
Wayland acceptance NOT_RUN. No microphone access, audio file, PCM log, automatic
logout, Shell reload, commit, merge, push or tag.
