# Playback timeline

Approved next feature: thin 4 px progress bar, elapsed/total labels beside the
existing controls, no seek control (Core1 permits transport only). Keep the card
shallow, current theme/size/artwork/beat behavior and outside dismissal.

Scope crosses Core/renderer because Position does not continuously signal under
MPRIS. Add optional positionSampleUs (host monotonic microseconds) to the existing
media dictionary, preserving XML methods/signals. Registry subscribes to Seeked,
refreshes Position after track/rate/playback changes and when requested. Core
snapshot/media getters schedule async refresh; opening the card requests a fresh
snapshot. UI estimates position from sample time, playback rate and monotonic now,
clamps to duration, and updates only while mapped/playing with a 250 ms timer.

Tests first: clock math, pause/rate/unknown duration; renderer timer cleanup and
fill/labels; fake MPRIS seek/refresh timestamps. Build/CTest, Node/GJS, theme CSS
and frozen XML gates; install Core/UI dependencies with backup/hash verification.
No blocking Shell D-Bus, microphone capture or new Core1 signature. No automatic
logout/reload. Live visual GNOME 46 acceptance remains NOT_RUN.

## Evidence

- RED clock test first missing module, then behavioral failure `advances from shared sample clock: expected 15000000, got 10000000`. Renderer RED: expected three card rows, got two. Native fake-MPRIS RED: seek expected 42000000 us, remained 1000000 us.
- Snapshot race RED: `opening panel must not roll back newer media signals: expected 20, got 19`. Reconciliation now keeps newer media/settings revisions from the same Core instance and ignores callbacks from a departed bus owner.
- GREEN eight Node files and seven GJS logic files pass, including timeline math. Renderer tests cover fill width, elapsed/total, audio updates not resetting the clock, pause/unmap/destroy timer cancellation. Fake MPRIS covers positive/negative Seeked and fresh query sample timestamps.
- Native build succeeds; all eight CTest suites pass, zero failures. Frozen Core1 XML test and unchanged XML diff pass. Token QA (26 contrast checks), generated CSS check, modified JS syntax and diff checks pass.
- Timeline CSS parsed by installed St.Theme in an independent GJS process; St.Bin.set_child verified. This is not a live Shell visual check.
- Installed new Core binary, mediaTimeline.js, coreProxy.js, mediaView.js, capsule.js, extension.js and stylesheet.css with SHA-256 matches. Metadata preserved. Backup: `/home/farzah/.local/state/linux-island/backups/media-timeline-20261024T204108.287753Z`.
- Core restarted successfully, active. Real snapshot reports player, known duration and numeric positionSampleUs; sample falls within the same GLib monotonic-clock domain and recent five-second window. No media text/position values logged.

Fresh GNOME session required for renderer. Afterwards progress and preference
updates are live. Actual visual GNOME 46 acceptance NOT_RUN. No automatic logout,
Shell reload, seek control, commit, push, merge or tag.
