#!/usr/bin/env bash
# Per-user Linux Island installer.
#
# Delegates the file layout to CMake (the same rules used by the packages) and
# only adds the two things that are per-user by nature: the systemd user unit
# in ~/.config/systemd/user and the XDG autostart entry.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/dev"

PREFIX="${HOME}/.local"
DO_BUILD=false
WITH_SYSTEMD=true
WITH_AUTOSTART=true

usage() {
    cat <<EOF
Usage: $(basename "$0") [options]

Install Linux Island for the current user only (no sudo).

Options:
  --build            Configure and build build/dev before installing
  --prefix DIR       Install prefix (default: \$HOME/.local)
  --no-systemd       Do not install or enable the systemd user unit
  --no-autostart     Do not install the XDG autostart entry
  --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --build) DO_BUILD=true ;;
        --prefix)
            shift
            [[ $# -gt 0 ]] || { echo "ERROR: --prefix needs a directory" >&2; exit 2; }
            PREFIX="$1"
            ;;
        --prefix=*) PREFIX="${1#*=}" ;;
        --no-systemd) WITH_SYSTEMD=false ;;
        --no-autostart) WITH_AUTOSTART=false ;;
        --help|-h) usage; exit 0 ;;
        *) echo "ERROR: unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

PREFIX="${PREFIX%/}"
BIN_DIR="$PREFIX/bin"
LIBEXEC_DIR="$PREFIX/libexec"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
SYSTEMD_USER_DIR="$CONFIG_HOME/systemd/user"
AUTOSTART_DIR="$CONFIG_HOME/autostart"
MANIFEST_DIR="$DATA_HOME/linux-island"
MANIFEST="$MANIFEST_DIR/installed-files.txt"
LAUNCHER="$BIN_DIR/linux-island-launch"

if [[ "$DO_BUILD" == true ]]; then
    echo "Building Linux Island (preset: dev)..."
    ( cd "$ROOT_DIR" && cmake --preset dev )
    cmake --build "$BUILD_DIR"
else
    if [[ ! -f "$BUILD_DIR/CMakeCache.txt" ]]; then
        echo "ERROR: no build tree at $BUILD_DIR" >&2
        echo "Run with --build, or configure it first: cmake --preset dev" >&2
        exit 1
    fi
    for bin in core/linux-island-core island-ui/linux-island-ui settings-app/linux-island-settings; do
        if [[ ! -x "$BUILD_DIR/$bin" ]]; then
            echo "ERROR: missing $BUILD_DIR/$bin" >&2
            echo "Run with --build to rebuild." >&2
            exit 1
        fi
    done
fi

echo "Installing into $PREFIX ..."
cmake --install "$BUILD_DIR" --prefix "$PREFIX"

# The shipped desktop files use bare command names so system packages work.
# A user-level prefix is not on PATH, so point Exec= at the real paths.
rewrite_exec() {
    local file="$1" pattern="$2" replacement="$3"
    [[ -f "$file" ]] || return 0
    sed -i "s|^Exec=$pattern|Exec=$replacement|" "$file"
}

rewrite_tryexec() {
    local file="$1" pattern="$2" replacement="$3"
    [[ -f "$file" ]] || return 0
    sed -i "s|^TryExec=$pattern|TryExec=$replacement|" "$file"
}

rewrite_exec "$PREFIX/share/applications/linux-island.desktop" \
    'linux-island-launch.*' "$LAUNCHER --standalone"
rewrite_tryexec "$PREFIX/share/applications/linux-island.desktop" \
    'linux-island-launch.*' "$LAUNCHER"
rewrite_exec "$PREFIX/share/applications/linux-island-settings.desktop" \
    'linux-island-settings.*' "$BIN_DIR/linux-island-settings"
rewrite_tryexec "$PREFIX/share/applications/linux-island-settings.desktop" \
    'linux-island-settings.*' "$BIN_DIR/linux-island-settings"
rewrite_exec "$PREFIX/share/linux-island/linux-island-autostart.desktop" \
    'linux-island-launch.*' "$LAUNCHER --autostart"
rewrite_tryexec "$PREFIX/share/linux-island/linux-island-autostart.desktop" \
    'linux-island-launch.*' "$LAUNCHER"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true
fi

STAGED_UNIT="$PREFIX/share/linux-island/linux-island-core.service"
PREFIX_UNIT="$PREFIX/lib/systemd/user/linux-island-core.service"
INSTALLED_UNIT="$SYSTEMD_USER_DIR/linux-island-core.service"

if [[ "$WITH_SYSTEMD" == true && -f "$STAGED_UNIT" ]]; then
    mkdir -p "$SYSTEMD_USER_DIR"
    cp "$STAGED_UNIT" "$INSTALLED_UNIT"
    rm -f "$STAGED_UNIT"
    # A user prefix is not a systemd system unit directory; the copy in
    # ~/.config/systemd/user is the one systemd --user reads.
    rm -f "$PREFIX_UNIT"
    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user daemon-reload >/dev/null 2>&1 || true
        systemctl --user enable --now linux-island-core.service >/dev/null 2>&1 || true
    fi
fi

AUTOSTART_FILE="$AUTOSTART_DIR/linux-island.desktop"
if [[ "$WITH_AUTOSTART" == true && -x "$LAUNCHER" ]]; then
    "$LAUNCHER" --install-autostart >/dev/null
fi

# --- manifest --------------------------------------------------------------

mkdir -p "$MANIFEST_DIR"
NEW_MANIFEST="$(mktemp)"
trap 'rm -f "$NEW_MANIFEST"' EXIT

if [[ -f "$BUILD_DIR/install_manifest.txt" ]]; then
    if [[ "$WITH_SYSTEMD" == true ]]; then
        # The staging copy is moved into ~/.config/systemd/user and the prefix
        # copy is dropped, so neither may be listed as an installed path.
        grep -vxF -e "$STAGED_UNIT" -e "$PREFIX_UNIT" \
            "$BUILD_DIR/install_manifest.txt" >"$NEW_MANIFEST" || true
    else
        cp "$BUILD_DIR/install_manifest.txt" "$NEW_MANIFEST"
    fi
else
    echo "ERROR: $BUILD_DIR/install_manifest.txt is missing" >&2
    exit 1
fi
# install_manifest.txt has no trailing newline; without this the first append
# would concatenate onto the last path.
if [[ -s "$NEW_MANIFEST" && "$(tail -c1 "$NEW_MANIFEST")" != "" ]]; then
    printf '\n' >>"$NEW_MANIFEST"
fi
if [[ "$WITH_SYSTEMD" == true && -f "$INSTALLED_UNIT" ]]; then
    printf '%s\n' "$INSTALLED_UNIT" >>"$NEW_MANIFEST"
fi
if [[ "$WITH_AUTOSTART" == true && -f "$AUTOSTART_FILE" ]]; then
    printf '%s\n' "$AUTOSTART_FILE" >>"$NEW_MANIFEST"
fi
sort -u -o "$NEW_MANIFEST" "$NEW_MANIFEST"

# Files from a previous install that this install no longer produces would
# otherwise linger forever (for example a renamed extension module).
if [[ -f "$MANIFEST" ]]; then
    while IFS= read -r old; do
        [[ -n "$old" ]] || continue
        if ! grep -qxF "$old" "$NEW_MANIFEST"; then
            rm -f "$old"
        fi
    done <"$MANIFEST"
fi

cp "$NEW_MANIFEST" "$MANIFEST"

missing=0
while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if [[ ! -e "$path" ]]; then
        echo "VERIFY FAILED: missing $path" >&2
        missing=$((missing + 1))
    fi
done <"$MANIFEST"

if [[ "$missing" -ne 0 ]]; then
    echo "ERROR: $missing installed file(s) missing after install." >&2
    exit 1
fi
echo "Verified: $(wc -l <"$MANIFEST") installed files."
echo "Manifest: $MANIFEST"
echo "Launch from a terminal with: $LAUNCHER --standalone"
