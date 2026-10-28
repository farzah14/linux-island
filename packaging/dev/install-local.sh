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
cp -a "$EXTENSION_DIR/." "$DEST_EXT/"

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
