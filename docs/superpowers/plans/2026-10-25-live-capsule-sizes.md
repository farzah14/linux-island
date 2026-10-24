# Live capsule sizes — M4-16B renderer preference

Connect the existing persisted capsuleSize setting to the Island. Medium keeps
the approved current shallow 360 px-wide layout; Small targets 300 px and Large
420 px. Adjust actual layout metrics, never whole-actor scaling (avoids text
blur). Scale artwork 40/48/56 px, button heights 28/32/36 px, and modest font/icon
sizes. Keep existing themes, audio levels, thumbnail and outside dismissal.

Scope: MediaView size presets/setter; Capsule compact metrics and label length;
extension state forwarding; renderer regression and manual smoke notes.

RED missing size setter; GREEN changing size while expanded or hidden, invalid
values ignored, restored medium, preserved theme/state, Core preference delivery.
Run Node/GJS logic/artwork, token/CSS/syntax/diff checks. Install only affected
extension JavaScript with backup/hash verification. No automatic logout/reload.

Live GNOME 46 visual/scaling acceptance remains NOT_RUN. Existing Settings app
already validates/persists small|medium|large; native Core changes not needed.

## Results

- RED `node tests/extension/capsule-rendering.test.js`, exit 1: `renderer needs live capsule sizing` (missing setter).
- GREEN exit 0: changes artwork/control/content dimensions for Small/Large, restores Medium, preserves expanded/hidden state and fullscreen visibility, ignores invalid/inherited object keys, refreshes title truncation without losing full metadata, and forwards Core capsuleSize.
- Seven Node test files, six existing GJS logic suites and GJS artwork test: exit 0, PASS. Generated theme CSS check and token QA (26 contrast checks): exit 0. Modified JavaScript syntax and `git diff --check`: exit 0.
- Installed GNOME St.Button.get_child verified as a function; dimensions/icon size use existing public actor properties rather than scaling text.
- Copied ui/mediaView.js, ui/capsule.js and extension.js with SHA-256 comparison. Metadata preserved; Core remains active. Backup: `/home/farzah/.local/state/linux-island/backups/live-sizes-20261024T201408.635486Z`.

Installed, awaits a fresh GNOME session. Afterwards Settings changes apply live.
Actual live layout/scaling and GNOME 46 visual acceptance NOT_RUN. Native tests
not repeated for this extension-only step. No logout, Shell reload, commit,
merge, push or tag performed.
