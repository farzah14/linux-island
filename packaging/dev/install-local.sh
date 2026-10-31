#!/usr/bin/env bash
set -euo pipefail

# Linux Island — Universal User-level installer for all Linux distributions and DEs
# Does NOT require sudo or root privileges.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Check for --build flag
for arg in "$@"; do
    if [[ "$arg" == "--build" ]]; then
        echo "Building Linux Island targets with preset 'dev'..."
        cmake --preset dev "$ROOT_DIR"
        cmake --build "$ROOT_DIR/build/dev"
    fi
done

CORE_BIN="$ROOT_DIR/build/dev/core/linux-island-core"
UI_BIN="$ROOT_DIR/build/dev/island-ui/linux-island-ui"
SETTINGS_BIN="$ROOT_DIR/build/dev/settings-app/linux-island-settings"
LAUNCH_BIN="$ROOT_DIR/packaging/bin/linux-island-launch"

CORE_SERVICE="$ROOT_DIR/packaging/systemd-user/linux-island-core.service"
UI_SERVICE="$ROOT_DIR/packaging/systemd-user/linux-island-ui.service"
AUTOSTART_FILE="$ROOT_DIR/packaging/autostart/linux-island.desktop"

DESKTOP_UI_FILE="$ROOT_DIR/packaging/desktop/linux-island.desktop"
DESKTOP_SETTINGS_FILE="$ROOT_DIR/packaging/desktop/linux-island-settings.desktop"
EXTENSION_DIR="$ROOT_DIR/extension"

if [[ ! -f "$CORE_BIN" || ! -f "$UI_BIN" ]]; then
    echo "ERROR: Binaries not found in $ROOT_DIR/build/dev"
    echo "Run with --build: ./packaging/dev/install-local.sh --build"
    exit 1
fi

DEST_LIBEXEC="$HOME/.local/libexec"
DEST_BIN="$HOME/.local/bin"
DEST_APPS="$HOME/.local/share/applications"
DEST_AUTOSTART="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
DEST_SYSTEMD="$HOME/.config/systemd/user"
DEST_EXT="$HOME/.local/share/gnome-shell/extensions/linux-island@local"

echo "Installing Linux Island per-user files across Linux desktop environments..."

mkdir -p "$DEST_LIBEXEC" "$DEST_BIN" "$DEST_APPS" "$DEST_AUTOSTART" "$DEST_SYSTEMD" "$DEST_EXT"

# 1. Daemon & UI executables
cp --remove-destination "$CORE_BIN" "$DEST_LIBEXEC/linux-island-core"
chmod +x "$DEST_LIBEXEC/linux-island-core"

cp --remove-destination "$UI_BIN" "$DEST_LIBEXEC/linux-island-ui"
chmod +x "$DEST_LIBEXEC/linux-island-ui"

# 2. CLI launcher & Settings
cp --remove-destination "$LAUNCH_BIN" "$DEST_BIN/linux-island-launch"
chmod +x "$DEST_BIN/linux-island-launch"

if [[ -f "$SETTINGS_BIN" ]]; then
    cp --remove-destination "$SETTINGS_BIN" "$DEST_BIN/linux-island-settings"
    chmod +x "$DEST_BIN/linux-island-settings"
fi

# 3. Systemd user units
cp "$CORE_SERVICE" "$DEST_SYSTEMD/linux-island-core.service"
cp "$UI_SERVICE" "$DEST_SYSTEMD/linux-island-ui.service"

# 4. XDG Autostart entry (for WMs / non-systemd sessions)
cp "$AUTOSTART_FILE" "$DEST_AUTOSTART/linux-island.desktop"

# 5. Application menu desktop entries
if [[ -f "$DESKTOP_UI_FILE" ]]; then
    cp "$DESKTOP_UI_FILE" "$DEST_APPS/linux-island.desktop"
fi
if [[ -f "$DESKTOP_SETTINGS_FILE" ]]; then
    cp "$DESKTOP_SETTINGS_FILE" "$DEST_APPS/linux-island-settings.desktop"
fi
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DEST_APPS" || true
fi

# 6. GNOME Shell extension files (for native GNOME dynamic mode)
# Count what actually changes first: the Shell caches ES modules per URL for the
# lifetime of the process, so the final message must say whether a restart is
# needed. A silent no-op here is what makes a new feature "not show up".
EXT_FILES_CHANGED=0
while IFS= read -r -d '' src; do
    rel="${src#"$EXTENSION_DIR"/}"
    if ! cmp -s "$src" "$DEST_EXT/$rel" 2>/dev/null; then
        EXT_FILES_CHANGED=$((EXT_FILES_CHANGED + 1))
    fi
done < <(find "$EXTENSION_DIR" -type f -print0)

cp -a "$EXTENSION_DIR/." "$DEST_EXT/"

# 6a. Drop files that no longer exist in the repo. `cp -a` only adds and
#     overwrites, so a renamed or deleted module would otherwise linger in the
#     install tree and shadow the new layout.
while IFS= read -r -d '' dest; do
    rel="${dest#"$DEST_EXT"/}"
    if [[ ! -f "$EXTENSION_DIR/$rel" ]]; then
        echo "Removing stale extension file: $rel"
        rm -f "$dest"
        EXT_FILES_CHANGED=$((EXT_FILES_CHANGED + 1))
    fi
done < <(find "$DEST_EXT" -type f -print0)

# 7. Reload systemd user daemon and enable units if systemctl is present
if command -v systemctl &>/dev/null; then
    systemctl --user daemon-reload || true
    systemctl --user enable linux-island-core.service || true
    systemctl --user enable linux-island-ui.service || true

    if systemctl --user is-active --quiet linux-island-core.service 2>/dev/null; then
        echo "Restarting linux-island-core.service..."
        systemctl --user restart linux-island-core.service || true
    fi
    if systemctl --user is-active --quiet linux-island-ui.service 2>/dev/null; then
        echo "Restarting linux-island-ui.service..."
        systemctl --user restart linux-island-ui.service || true
    fi
fi

echo "Installation complete!"
echo "Files installed to:"
echo " - $DEST_LIBEXEC/linux-island-core"
echo " - $DEST_LIBEXEC/linux-island-ui"
echo " - $DEST_BIN/linux-island-launch"
echo " - $DEST_BIN/linux-island-settings"
echo " - $DEST_SYSTEMD/linux-island-core.service"
echo " - $DEST_SYSTEMD/linux-island-ui.service"
echo " - $DEST_AUTOSTART/linux-island.desktop"
echo " - $DEST_APPS/linux-island.desktop"
echo " - $DEST_APPS/linux-island-settings.desktop"
echo " - $DEST_EXT"

# --- 8. Verify the install actually matches the build ----------------------
# A stale install is indistinguishable from a missing feature at runtime, so
# fail loudly rather than reporting success on a partial copy.
VERIFY_FAILED=0

fail_verify() {
    echo "VERIFY FAILED: $*" >&2
    VERIFY_FAILED=1
}

for pair in \
    "$CORE_BIN:$DEST_LIBEXEC/linux-island-core" \
    "$UI_BIN:$DEST_LIBEXEC/linux-island-ui" \
    "$LAUNCH_BIN:$DEST_BIN/linux-island-launch"; do
    src="${pair%%:*}"
    dest="${pair#*:}"
    if [[ ! -f "$dest" ]]; then
        fail_verify "missing $dest"
    elif ! cmp -s "$src" "$dest"; then
        fail_verify "$dest does not match $src"
    fi
done

if [[ -f "$SETTINGS_BIN" ]]; then
    cmp -s "$SETTINGS_BIN" "$DEST_BIN/linux-island-settings" \
        || fail_verify "$DEST_BIN/linux-island-settings does not match $SETTINGS_BIN"
fi

# Extension tree must be byte-identical, and must not contain extra files.
while IFS= read -r -d '' src; do
    rel="${src#"$EXTENSION_DIR"/}"
    cmp -s "$src" "$DEST_EXT/$rel" || fail_verify "extension file differs: $rel"
done < <(find "$EXTENSION_DIR" -type f -print0)

while IFS= read -r -d '' dest; do
    rel="${dest#"$DEST_EXT"/}"
    [[ -f "$EXTENSION_DIR/$rel" ]] || fail_verify "stale extension file: $rel"
done < <(find "$DEST_EXT" -type f -print0)

if [[ "$VERIFY_FAILED" -ne 0 ]]; then
    echo "ERROR: installation verification failed; the installed tree does not match the build." >&2
    exit 1
fi
echo "Verified: installed files match the build."

# --- 9. Tell the user what still needs doing ------------------------------
if [[ "$EXT_FILES_CHANGED" -gt 0 ]]; then
    echo
    echo "NOTE: $EXT_FILES_CHANGED GNOME Shell extension file(s) changed."
    echo "      GNOME caches ES modules for the lifetime of the Shell process, and"
    echo "      ReloadExtension is not implemented on GNOME 49+. The new code is"
    echo "      already on disk but will NOT load until the Shell restarts:"
    echo "        - sign out and back in, or"
    echo "        - use scripts/dev/dev.sh reload extension --target primary (dev loader)."
else
    echo "GNOME Shell extension files unchanged; no Shell restart needed."
fi

if command -v systemctl &>/dev/null; then
    if ! systemctl --user is-active --quiet linux-island-core.service 2>/dev/null; then
        echo
        echo "NOTE: linux-island-core.service is not running; start it with:"
        echo "        systemctl --user start linux-island-core.service"
    fi
fi
