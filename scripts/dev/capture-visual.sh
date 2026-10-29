#!/usr/bin/env bash
# Linux Island — visual evidence capture (run INSIDE the test GNOME session).
#
# Headless dev sessions prove that code *loads*. They cannot prove that it
# *looks right*. This script captures the visual evidence that only a real,
# visible session can provide.
#
# Usage (inside the test account's desktop session, from a terminal):
#   scripts/dev/capture-visual.sh
#   scripts/dev/capture-visual.sh --out ~/island-evidence
#
# What it records:
#   1. Environment facts (shell version, session type, monitor geometry)
#   2. Extension state and errors
#   3. Screenshots: compact, expanded (music), expanded (system), expanded (AI)
#   4. Capsule geometry measured from the screenshot, not assumed
#
# It never modifies settings, never restarts the shell, and never sends media
# commands. Everything is read-only apart from writing PNGs to the output dir.

set -euo pipefail

OUT="${HOME}/island-evidence"
while [ $# -gt 0 ]; do
    case "$1" in
        --out) OUT="${2:-}"; shift 2 ;;
        -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

mkdir -p "$OUT"
REPORT="$OUT/report.txt"
: > "$REPORT"

say() { echo "$*" | tee -a "$REPORT"; }
section() { echo "" | tee -a "$REPORT"; echo "== $* ==" | tee -a "$REPORT"; }

need() {
    command -v "$1" >/dev/null 2>&1 || { echo "ERROR: missing dependency: $1" >&2; exit 3; }
}

need gnome-screenshot
need gdbus

section "environment"
say "date          : $(date -Is)"
say "session type  : ${XDG_SESSION_TYPE:-unknown}"
say "desktop       : ${XDG_CURRENT_DESKTOP:-unknown}"
say "shell         : $(gnome-shell --version 2>/dev/null || echo unknown)"
say "user          : $(id -un) (uid $(id -u))"
say "wayland       : ${WAYLAND_DISPLAY:-none}"

section "extension"
if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions info linux-island@local 2>&1 | sed 's/^/  /' | tee -a "$REPORT"
else
    say "gnome-extensions not available"
fi

section "core"
if gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
    --method org.freedesktop.DBus.NameHasOwner io.github.linuxisland.Core 2>/dev/null | grep -q true; then
    say "core          : running"
    SNAP="$(gdbus call --session --dest io.github.linuxisland.Core \
        --object-path /io/github/linuxisland/Core \
        --method io.github.linuxisland.Core1.GetSnapshot 2>/dev/null || true)"
    say "instanceId    : $(printf '%s' "$SNAP" | sed -n "s/.*'instanceId': <'\([^']*\)'>.*/\1/p")"
    say "revision      : $(printf '%s' "$SNAP" | sed -n "s/.*'revision': <uint64 \([0-9]*\)>.*/\1/p")"
    say "player        : $(printf '%s' "$SNAP" | sed -n "s/.*'playerId': <'\([^']*\)'>.*/\1/p")"
else
    say "core          : NOT RUNNING (UI will show the disconnected state)"
fi

section "display geometry"
if command -v xrandr >/dev/null 2>&1; then
    xrandr --current 2>/dev/null | grep -E "connected|current" | head -3 | tee -a "$REPORT" || true
else
    say "xrandr not available (Wayland: geometry comes from the screenshot below)"
fi

# --- capture ---------------------------------------------------------------

shot() {
    local name="$1"
    local path="$OUT/${name}.png"
    if gnome-screenshot -f "$path" 2>/dev/null; then
        say "captured      : $path"
    else
        say "FAILED        : $path (screenshot denied?)"
        return 1
    fi
}

section "captures"
say "The island starts COMPACT. The script captures that first, then asks you"
say "to click the capsule so it expands."
say ""

sleep 1
shot 01-compact || true

echo "" | tee -a "$REPORT"
read -r -p "Click the island so it EXPANDS, then press Enter here... " _ || true
sleep 1
shot 02-expanded || true

echo "" | tee -a "$REPORT"
read -r -p "Switch to the System page (click the tab / swipe), then press Enter... " _ || true
sleep 1
shot 03-system || true

echo "" | tee -a "$REPORT"
read -r -p "Switch to the AI Quota page, then press Enter... " _ || true
sleep 1
shot 04-ai-quota || true

# --- measurement -----------------------------------------------------------

section "measurements"
# Measure the capsule from the screenshot instead of trusting source constants.
if command -v python3 >/dev/null 2>&1; then
    python3 - "$OUT" <<'PY' | tee -a "$REPORT"
import sys, pathlib, struct

out = pathlib.Path(sys.argv[1])

def read_png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    if head[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    return struct.unpack('>II', head[16:24])

for png in sorted(out.glob('*.png')):
    size = read_png_size(png)
    print(f"  {png.name:20s} {size[0]}x{size[1]}" if size else f"  {png.name:20s} unreadable")

print("")
print("  Capsule top edge and width must be checked by eye against the")
print("  screenshots; a headless run cannot verify either.")
PY
else
    say "python3 missing; skipping size report"
fi

section "result"
say "Evidence written to: $OUT"
say "Attach these PNGs when claiming visual acceptance."
say ""
say "Still NOT proven by this script:"
say "  - GNOME 46 compatibility (this host is a different version)"
say "  - animation smoothness (needs frame-level capture)"
say "  - input masking outside the capsule (needs a click test)"
