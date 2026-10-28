#!/usr/bin/env bash
# READ-ONLY: Linux Island M0 environment audit. No downloads or system changes.
set -u

probe() {
    local label="$1" command="$2"
    if command -v "$command" >/dev/null 2>&1; then
        printf 'FOUND   %-19s %s\n' "$label" "$(command -v "$command")"
    else
        printf 'MISSING %-19s %s\n' "$label" "$command"
    fi
}

printf '%s\n' '=== Linux Island environment (read only) ==='
printf 'Date UTC: %s\n' "$(date -u +%FT%TZ)"
printf 'OS: '
if command -v lsb_release >/dev/null 2>&1; then lsb_release -ds; elif test -r /etc/os-release; then sed -n 's/^PRETTY_NAME=//p' /etc/os-release | head -n 1; else echo UNKNOWN; fi
printf 'Session type: %s\n' "${XDG_SESSION_TYPE:-UNKNOWN}"
printf 'Desktop: %s\n' "${XDG_CURRENT_DESKTOP:-UNKNOWN}"
for item in 'git:git' 'g++:g++' 'cmake:cmake' 'ninja:ninja' 'node:node' 'python3:python3' 'GJS:gjs' 'GNOME Shell:gnome-shell' 'GNOME CLI:gnome-extensions' 'pkg-config:pkg-config' 'gdbus:gdbus' 'dbus-run-session:dbus-run-session'; do
    probe "${item%%:*}" "${item#*:}"
done
if command -v gnome-shell >/dev/null 2>&1; then gnome-shell --version || :; fi
if command -v gjs >/dev/null 2>&1; then gjs --version || :; fi
if command -v cmake >/dev/null 2>&1; then cmake --version | head -n 1; fi
if command -v pkg-config >/dev/null 2>&1; then
    HAS_MISSING=false
    for p in Qt6Core Qt6DBus Qt6Quick Qt6Qml; do
        if pkg-config --exists "$p"; then
            printf 'FOUND   %-19s version %s\n' "$p" "$(pkg-config --modversion "$p")"
        else
            printf 'MISSING %-19s via pkg-config\n' "$p"
            HAS_MISSING=true
        fi
    done
    if [ "$HAS_MISSING" = true ]; then
        printf '\nDistro-specific dependency hints:\n'
        DISTRO_ID="unknown"
        if test -r /etc/os-release; then
            DISTRO_ID="$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"')"
            DISTRO_LIKE="$(sed -n 's/^ID_LIKE=//p' /etc/os-release | tr -d '"')"
        fi
        case "$DISTRO_ID" in
            ubuntu|debian|pop|linuxmint)
                printf '  sudo apt update && sudo apt install -y qt6-base-dev qt6-declarative-dev qt6-tools-dev cmake ninja-build build-essential\n' ;;
            fedora|rhel|centos)
                printf '  sudo dnf install -y qt6-qtbase-devel qt6-qtdeclarative-devel cmake ninja-build gcc-c++\n' ;;
            arch|manjaro|endeavouros)
                printf '  sudo pacman -S --needed qt6-base qt6-declarative cmake ninja base-devel\n' ;;
            opensuse*|suse)
                printf '  sudo zypper install -y qt6-base-devel qt6-declarative-devel cmake ninja gcc-c++\n' ;;
            alpine)
                printf '  sudo apk add qt6-qtbase-dev qt6-qtdeclarative-dev cmake ninja g++ build-base\n' ;;
            void)
                printf '  sudo xbps-install -S qt6-base-devel qt6-declarative-devel cmake ninja base-devel\n' ;;
            *)
                printf '  Install Qt 6 (Core, DBus, Quick, Qml development packages), CMake 3.22+, and Ninja.\n' ;;
        esac
    fi
fi
printf '%s\n' '=== Audit only; no packages installed ==='
