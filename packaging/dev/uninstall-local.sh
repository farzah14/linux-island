#!/usr/bin/env bash
# Per-user Linux Island uninstaller.
#
# Removes everything install-local.sh installed, using its manifest, plus the
# fixed paths older releases wrote. User configuration is preserved unless
# --purge-config is given.
set -euo pipefail

PREFIX="${HOME}/.local"
PREFIX_EXPLICIT=false
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
MANIFEST="$DATA_HOME/linux-island/installed-files.txt"

PURGE_CONFIG=false
WITH_SYSTEMD=true

usage() {
    cat <<EOF
Usage: $(basename "$0") [options]

Remove a per-user Linux Island installation.

Options:
  --prefix DIR     Install prefix used at install time (default: $HOME/.local)
  --purge-config   Also delete $CONFIG_HOME/linux-island
  --no-systemd     Do not stop or disable systemd user units
  --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --prefix)
            shift
            [[ $# -gt 0 ]] || { echo "ERROR: --prefix needs a directory" >&2; exit 2; }
            PREFIX="$1"
            PREFIX_EXPLICIT=true
            ;;
        --prefix=*) PREFIX="${1#*=}"; PREFIX_EXPLICIT=true ;;
        --purge-config) PURGE_CONFIG=true ;;
        --no-systemd) WITH_SYSTEMD=false ;;
        --help|-h) usage; exit 0 ;;
        *) echo "ERROR: unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

PREFIX="${PREFIX%/}"
if [[ "$PREFIX_EXPLICIT" == false && -f "$MANIFEST" ]]; then
    # A custom --prefix install records its own paths; recover the prefix from
    # the launcher entry so the directory cleanup below targets the right tree.
    manifest_launcher="$(grep -m1 '/bin/linux-island-launch$' "$MANIFEST" || true)"
    if [[ -n "$manifest_launcher" ]]; then
        PREFIX="$(dirname "$(dirname "$manifest_launcher")")"
    fi
fi

if [[ "$WITH_SYSTEMD" == true ]] && command -v systemctl >/dev/null 2>&1; then
    for unit in linux-island-core.service linux-island-ui.service; do
        systemctl --user stop "$unit" >/dev/null 2>&1 || true
        systemctl --user disable "$unit" >/dev/null 2>&1 || true
    done
fi

if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable linux-island@local >/dev/null 2>&1 || true
fi

if [[ -f "$MANIFEST" ]]; then
    while IFS= read -r path; do
        [[ -n "$path" ]] || continue
        rm -f "$path"
    done <"$MANIFEST"
fi

# The manifest itself, and the staged systemd unit a --no-systemd install keeps.
rm -f "$MANIFEST" "$PREFIX/share/linux-island/linux-island-core.service"

# Paths written by releases that predate the manifest.
for path in \
    "$HOME/.local/libexec/linux-island-core" \
    "$HOME/.local/libexec/linux-island-ui" \
    "$HOME/.local/bin/linux-island-launch" \
    "$HOME/.local/bin/linux-island-settings" \
    "$CONFIG_HOME/systemd/user/linux-island-core.service" \
    "$CONFIG_HOME/systemd/user/linux-island-ui.service" \
    "$CONFIG_HOME/autostart/linux-island.desktop" \
    "$HOME/.local/share/applications/linux-island.desktop" \
    "$HOME/.local/share/applications/linux-island-settings.desktop"; do
    rm -f "$path"
done
rm -rf "$HOME/.local/share/gnome-shell/extensions/linux-island@local"

# update-desktop-database creates this cache on demand; it is ours to clean up
# before the directory sweep, otherwise `applications/` never becomes empty.
rm -f "$PREFIX/share/applications/mimeinfo.cache"

for dir in \
    "$DATA_HOME/linux-island/window-rules" \
    "$DATA_HOME/linux-island" \
    "$PREFIX/lib/systemd/user" \
    "$PREFIX/share/gnome-shell/extensions" \
    "$PREFIX/share/applications" \
    "$PREFIX/share/metainfo" \
    "$PREFIX/share/icons/hicolor/scalable/apps" \
    "$PREFIX/share/dbus-1/interfaces" \
    "$PREFIX/share/licenses/linux-island"; do
    rmdir -p --ignore-fail-on-non-empty "$dir" >/dev/null 2>&1 || true
done

if [[ -d "$PREFIX/share/applications" ]] && command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true
fi

if [[ "$WITH_SYSTEMD" == true ]] && command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload >/dev/null 2>&1 || true
fi

CONFIG_DIR="$CONFIG_HOME/linux-island"
if [[ "$PURGE_CONFIG" == true ]]; then
    rm -rf "$CONFIG_DIR"
    echo "Removed configuration: $CONFIG_DIR"
elif [[ -d "$CONFIG_DIR" ]]; then
    echo "Preserved configuration: $CONFIG_DIR"
    echo "Remove it with: $(basename "$0") --purge-config"
fi

echo "Uninstalled Linux Island."
