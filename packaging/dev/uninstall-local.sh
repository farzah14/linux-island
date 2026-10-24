#!/usr/bin/env bash
set -euo pipefail

# Linux Island — User-level local uninstaller
# Removes only files installed by install-local.sh.

echo "Uninstalling Linux Island..."

# Stop and disable systemd service if running
if command -v systemctl &>/dev/null; then
    systemctl --user stop linux-island-core.service 2>/dev/null || true
    systemctl --user disable linux-island-core.service 2>/dev/null || true
fi

# Disable GNOME extension if enabled
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions disable linux-island@local 2>/dev/null || true
fi

# Remove installed binaries and service
rm -f "$HOME/.local/libexec/linux-island-core"
rm -f "$HOME/.local/bin/linux-island-settings"
rm -f "$HOME/.config/systemd/user/linux-island-core.service"

# Remove extension folder
rm -rf "$HOME/.local/share/gnome-shell/extensions/linux-island@local"

if command -v systemctl &>/dev/null; then
    systemctl --user daemon-reload || true
fi

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/linux-island"
if [[ -d "$CONFIG_DIR" ]]; then
    echo "Notice: User configuration preserved at $CONFIG_DIR"
    echo "To delete settings as well, run: rm -rf '$CONFIG_DIR'"
fi

echo "Uninstallation complete. No orphan service or files remain."
