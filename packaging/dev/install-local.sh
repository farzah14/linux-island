#!/usr/bin/env bash
set -euo pipefail

# Linux Island — User-level local developer installer
# Does NOT require sudo or root privileges.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

CORE_BIN="$ROOT_DIR/build/dev/core/linux-island-core"
SETTINGS_BIN="$ROOT_DIR/build/dev/settings-app/linux-island-settings"
SERVICE_FILE="$ROOT_DIR/packaging/systemd-user/linux-island-core.service"
EXTENSION_DIR="$ROOT_DIR/extension"

if [[ ! -f "$CORE_BIN" ]]; then
    echo "ERROR: Core binary not built at $CORE_BIN"
    echo "Run: cmake --build build/dev"
    exit 1
fi

DEST_LIBEXEC="$HOME/.local/libexec"
DEST_BIN="$HOME/.local/bin"
DEST_SYSTEMD="$HOME/.config/systemd/user"
DEST_EXT="$HOME/.local/share/gnome-shell/extensions/linux-island@local"

echo "Installing Linux Island per-user files..."

mkdir -p "$DEST_LIBEXEC" "$DEST_BIN" "$DEST_SYSTEMD" "$DEST_EXT"

cp "$CORE_BIN" "$DEST_LIBEXEC/linux-island-core"
chmod +x "$DEST_LIBEXEC/linux-island-core"

if [[ -f "$SETTINGS_BIN" ]]; then
    cp "$SETTINGS_BIN" "$DEST_BIN/linux-island-settings"
    chmod +x "$DEST_BIN/linux-island-settings"
fi

cp "$SERVICE_FILE" "$DEST_SYSTEMD/linux-island-core.service"

# Install extension files
cp -a "$EXTENSION_DIR/." "$DEST_EXT/"

# Reload systemd user daemon
if command -v systemctl &>/dev/null; then
    systemctl --user daemon-reload || true
fi

echo "Installation complete!"
echo "Files installed to:"
echo " - $DEST_LIBEXEC/linux-island-core"
echo " - $DEST_BIN/linux-island-settings"
echo " - $DEST_SYSTEMD/linux-island-core.service"
echo " - $DEST_EXT"
