#!/usr/bin/env bash
set -euo pipefail

# Linux Island — Universal User-level local uninstaller
# Removes files installed by install-local.sh across desktop environments.

echo "Uninstalling Linux Island..."

# Stop and disable systemd services if present
if command -v systemctl &>/dev/null; then
    systemctl --user stop linux-island-ui.service 2>/dev/null || true
    systemctl --user disable linux-island-ui.service 2>/dev/null || true
    systemctl --user stop linux-island-core.service 2>/dev/null || true
    systemctl --user disable linux-island-core.service 2>/dev/null || true
fi

# Kill any lingering standalone processes
pkill -u "$USER" -f "linux-island-ui" 2>/dev/null || true
pkill -u "$USER" -f "linux-island-core" 2>/dev/null || true

# Disable GNOME extension if enabled
if command -v gnome-extensions &>/dev/null; then
    gnome-extensions disable linux-island@local 2>/dev/null || true
fi

# Remove installed binaries and scripts
rm -f "$HOME/.local/libexec/linux-island-core"
rm -f "$HOME/.local/libexec/linux-island-ui"
rm -f "$HOME/.local/bin/linux-island-launch"
rm -f "$HOME/.local/bin/linux-island-settings"

# Remove systemd user units
rm -f "$HOME/.config/systemd/user/linux-island-core.service"
rm -f "$HOME/.config/systemd/user/linux-island-ui.service"

# Remove autostart desktop entry
rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/linux-island.desktop"

# Remove desktop application entries
rm -f "$HOME/.local/share/applications/linux-island.desktop"
rm -f "$HOME/.local/share/applications/linux-island-settings.desktop"
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

# Remove GNOME extension folder
rm -rf "$HOME/.local/share/gnome-shell/extensions/linux-island@local"

if command -v systemctl &>/dev/null; then
    systemctl --user daemon-reload || true
fi

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/linux-island"
if [[ -d "$CONFIG_DIR" ]]; then
    echo "Notice: User configuration preserved at $CONFIG_DIR"
    echo "To delete settings as well, run: rm -rf '$CONFIG_DIR'"
fi

echo "Uninstallation complete. No orphan services or files remain."
