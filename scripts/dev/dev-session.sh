#!/usr/bin/env bash
# Linux Island — isolated development session (no logout of the primary desktop).
#
# Starts a *separate* GNOME Shell process on a private D-Bus session with its own
# XDG dirs, dconf profile, extension copy and Core instance. Your daily session,
# its dconf keys, its extension and its Core are never touched.
#
# Usage:
#   scripts/dev/dev-session.sh mode      # resolve shell mode (machine-readable)
#   scripts/dev/dev-session.sh start     # start the test session in background
#   scripts/dev/dev-session.sh stop      # stop only this runner's processes
#   scripts/dev/dev-session.sh status
#   scripts/dev/dev-session.sh logs
#
# Environment overrides (testing only):
#   ISLAND_FAKE_VERSION=50.1   pretend this shell version
#   ISLAND_FAKE_DEVKIT=1|0     pretend mutter-devkit presence
#   ISLAND_STATE_DIR=<path>    state directory (default: $XDG_RUNTIME_DIR/linux-island-dev-session)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_EXT="$ROOT_DIR/extension"
CORE_BIN="$ROOT_DIR/build/dev/core/linux-island-core"

STATE_DIR="${ISLAND_STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/linux-island-dev-session}"
PID_FILE="$STATE_DIR/runner.pid"
PGID_FILE="$STATE_DIR/runner.pgid"
LOG_DIR="$STATE_DIR/log"

die() { echo "ERROR: $*" >&2; exit 1; }
note() { echo "$*" >&2; }

# --- mode resolution -------------------------------------------------------

shell_version() {
    if [ -n "${ISLAND_FAKE_VERSION:-}" ]; then
        printf '%s' "$ISLAND_FAKE_VERSION"
        return 0
    fi
    local raw
    raw="$(gnome-shell --version 2>/dev/null || true)"
    printf '%s' "$raw" | awk '{print $NF}'
}

major_of() {
    local v="$1"
    case "$v" in
        ''|*[!0-9.]*) return 1 ;;
    esac
    printf '%s' "${v%%.*}"
}

devkit_present() {
    if [ -n "${ISLAND_FAKE_DEVKIT:-}" ]; then
        [ "$ISLAND_FAKE_DEVKIT" = "1" ]
        return
    fi
    # Ubuntu does not package mutter-devkit; Fedora/Arch ship it separately.
    for p in /usr/libexec/mutter-devkit /usr/lib/mutter-devkit /usr/bin/mutter-devkit; do
        [ -x "$p" ] && return 0
    done
    command -v mutter-devkit >/dev/null 2>&1
}

resolve_mode() {
    local version major
    version="$(shell_version)"
    if ! major="$(major_of "$version")"; then
        note "Cannot parse GNOME Shell version: '${version:-<empty>}'"
        note "Set ISLAND_FAKE_VERSION to override, or run: gnome-shell --version"
        return 1
    fi
    if [ "$major" -lt 49 ]; then
        printf 'nested'
        return 0
    fi
    if devkit_present; then
        printf 'devkit'
        return 0
    fi
    note "GNOME ${version}: --nested was removed in 49 and mutter-devkit is not installed."
    note "Falling back to 'headless': the shell runs and loads extensions, but has no visible window."
    note "For a *visible* test desktop without logging out, use Switch User to a test account."
    printf 'headless'
}

shell_args() {
    case "$1" in
        nested)   printf '%s' '--nested --wayland' ;;
        devkit)   printf '%s' '--devkit --wayland' ;;
        headless) printf '%s' '--headless --virtual-monitor 1280x800' ;;
        *) die "unknown mode: $1" ;;
    esac
}

# --- session lifecycle -----------------------------------------------------

running_pid() {
    [ -f "$PID_FILE" ] || return 1
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    [ -n "$pid" ] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    printf '%s' "$pid"
}

prepare_state() {
    mkdir -p "$STATE_DIR"/{config/dconf/profile,data,cache,runtime,log}
    chmod 700 "$STATE_DIR" "$STATE_DIR/runtime"
    # Isolated dconf profile: writes go to $XDG_CONFIG_HOME/dconf/user, never ~/.config/dconf.
    printf 'user-db:user\n' > "$STATE_DIR/config/dconf/profile/island-dev"
}

# Declare the host major version in a staged metadata.json so GNOME does not
# mark it OUT_OF_DATE. Only the throwaway copy is modified.
declare_host_version() {
    local metadata="$1"
    local version
    version="$(shell_version)"
    if [ -z "$version" ]; then
        note "WARNING: cannot determine GNOME Shell version; staged metadata unchanged."
        return 0
    fi
    python3 "$ROOT_DIR/scripts/dev/stage-metadata.py" \
        --metadata "$metadata" --shell-version "$version" || \
        note "WARNING: failed to declare GNOME $version in $metadata"
}

stage_extension() {
    local dest="$STATE_DIR/data/gnome-shell/extensions/linux-island@local"
    rm -rf "$dest"
    mkdir -p "$(dirname "$dest")"
    cp -a "$SRC_EXT" "$dest"
    declare_host_version "$dest/metadata.json"
    printf '%s' "$dest"
}

# The dev loader must exist *before* the shell starts, otherwise the shell never
# scans its UUID. Installing it into the isolated XDG_DATA_HOME keeps the
# primary session untouched.
stage_dev_loader() {
    local loader_src="$ROOT_DIR/scripts/dev/dev-reload.sh"
    local dest="$STATE_DIR/data/gnome-shell/extensions/island-dev@local"
    [ -f "$loader_src" ] || return 0
    rm -rf "$dest"
    mkdir -p "$dest"
    # Reuse the single source of truth for the loader source.
    ISLAND_EMIT_LOADER="$dest" bash "$loader_src" emit-loader >/dev/null
    declare_host_version "$dest/metadata.json"
    printf '%s' "$dest"
}

cmd_start() {
    local mode pid
    if pid="$(running_pid)"; then
        die "dev session already running (pid $pid); run: $0 stop"
    fi
    [ -x "$CORE_BIN" ] || die "Core binary missing: $CORE_BIN (run: cmake --build build/dev)"

    mode="$(resolve_mode)" || exit 1
    prepare_state
    local staged loader
    staged="$(stage_extension)"
    loader="$(stage_dev_loader)"

    note "Starting isolated GNOME session (mode: $mode)"
    note "  state : $STATE_DIR"
    note "  ext   : $staged"
    note "  loader: ${loader:-<none>}"

    # setsid gives the runner its own process group so stop() can be precise.
    setsid env \
        ISLAND_STATE_DIR="$STATE_DIR" \
        ISLAND_MODE="$mode" \
        ISLAND_SHELL_ARGS="$(shell_args "$mode")" \
        ISLAND_CORE_BIN="$CORE_BIN" \
        bash -c '
            set -u
            S="$ISLAND_STATE_DIR"
            export XDG_CONFIG_HOME="$S/config"
            export XDG_DATA_HOME="$S/data"
            export XDG_CACHE_HOME="$S/cache"
            export XDG_RUNTIME_DIR="$S/runtime"
            export DCONF_PROFILE="$S/config/dconf/profile/island-dev"
            export GSETTINGS_BACKEND=dconf
            # Avoid the primary session’s accessibility bus and portal.
            unset DISPLAY WAYLAND_DISPLAY AT_SPI_BUS_ADDRESS
            mkdir -p "$S/log"
            dbus-run-session -- bash -c "
                set -u
                echo \"=== bus: \$DBUS_SESSION_BUS_ADDRESS\"
                # Publish the private bus address so tooling can target *this* shell
                # instead of the primary session.
                printf '%s' \"\$DBUS_SESSION_BUS_ADDRESS\" > \"$S/bus-address\"
                printf '%s' \"\$XDG_RUNTIME_DIR\" > \"$S/runtime-dir\"
                \"$ISLAND_CORE_BIN\" >\"$S/log/core.log\" 2>&1 &
                CORE_PID=\$!
                for i in \$(seq 1 40); do
                    gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
                        --method org.freedesktop.DBus.NameHasOwner io.github.linuxisland.Core 2>/dev/null \
                        | grep -q true && break
                    sleep 0.25
                done
                echo \"=== core pid: \$CORE_PID\"
                gnome-shell $ISLAND_SHELL_ARGS >\"$S/log/shell.log\" 2>&1 &
                SHELL_PID=\$!
                for i in \$(seq 1 60); do
                    gnome-extensions list >/dev/null 2>&1 && break
                    sleep 0.5
                done
                echo \"=== shell pid: \$SHELL_PID mode: $ISLAND_MODE\"
                # Prefer the dev loader (supports hot reload); fall back to the
                # plain staged extension if the loader was not staged.
                gnome-extensions enable island-dev@local >/dev/null 2>&1 \
                    || gnome-extensions enable linux-island@local >/dev/null 2>&1 || true
                wait \$SHELL_PID
                kill \$CORE_PID 2>/dev/null || true
            "
        ' >>"$LOG_DIR/runner.log" 2>&1 &

    local runner=$!
    printf '%s' "$runner" > "$PID_FILE"
    printf '%s' "$(ps -o pgid= -p "$runner" 2>/dev/null | tr -d ' ')" > "$PGID_FILE"
    sleep 1

    if ! running_pid >/dev/null; then
        note "--- runner log ---"
        tail -30 "$LOG_DIR/runner.log" >&2 2>/dev/null || true
        die "dev session exited immediately"
    fi
    echo "Dev session started (pid $runner, mode $mode)."
    echo "Check readiness: $0 status"
}

cmd_stop() {
    local pid pgid
    if ! pid="$(running_pid)"; then
        echo "No dev session running."
        rm -f "$PID_FILE" "$PGID_FILE"
        return 0
    fi
    pgid="$(cat "$PGID_FILE" 2>/dev/null || true)"
    # Only ever signal this runner’s own process group.
    if [ -n "$pgid" ] && [ "$pgid" != "1" ]; then
        kill -TERM -"$pgid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    else
        kill -TERM "$pid" 2>/dev/null || true
    fi
    for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.25
    done
    if kill -0 "$pid" 2>/dev/null; then
        note "Runner did not exit; escalating within its own group only."
        [ -n "$pgid" ] && kill -KILL -"$pgid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE" "$PGID_FILE"
    cleanup_state
    echo "Dev session stopped."
}

# Remove per-run state so a stale bus-address or staged tree cannot be reused.
# GVFS creates its own subdirectories under runtime/, which are not writable by
# this process after the session dies, so removal is best-effort and retried.
cleanup_state() {
    [ -d "$STATE_DIR" ] || return 0
    local attempt
    for attempt in 1 2 3; do
        rm -rf "$STATE_DIR" 2>/dev/null && return 0
        # Make gvfs leftovers removable before retrying.
        chmod -R u+rwX "$STATE_DIR" 2>/dev/null || true
        sleep 0.2
    done
    note "WARNING: could not fully remove $STATE_DIR (leftovers: $(ls -A "$STATE_DIR" 2>/dev/null | tr '\n' ' '))"
    return 0
}

cmd_status() {
    local pid mode
    mode="$(resolve_mode 2>/dev/null || echo unknown)"
    echo "Mode      : $mode"
    echo "State dir : $STATE_DIR"
    if pid="$(running_pid)"; then
        echo "Runner    : running (pid $pid)"
    else
        echo "Runner    : stopped"
    fi
    if [ -f "$STATE_DIR/data/gnome-shell/extensions/linux-island@local/extension.js" ]; then
        echo "Staged ext: $(find "$STATE_DIR/data/gnome-shell/extensions/linux-island@local" -newer "$SRC_EXT/extension.js" -name '*.js' 2>/dev/null | wc -l) newer files than source"
    else
        echo "Staged ext: (not staged)"
    fi
    if [ -f "$LOG_DIR/shell.log" ]; then
        echo "Last shell errors:"
        grep -iE "ERROR|CRITICAL|TypeError|SyntaxError" "$LOG_DIR/shell.log" 2>/dev/null | tail -3 | sed 's/^/  /' || true
    fi
}

cmd_logs() {
    [ -d "$LOG_DIR" ] || die "no logs yet: $LOG_DIR"
    tail -n "${2:-40}" "$LOG_DIR/runner.log" 2>/dev/null || true
    echo "--- shell.log ---"
    tail -n "${2:-40}" "$LOG_DIR/shell.log" 2>/dev/null || true
}

case "${1:-}" in
    mode)   resolve_mode ;;
    start)  cmd_start ;;
    stop)   cmd_stop ;;
    status) cmd_status ;;
    logs)   cmd_logs "$@" ;;
    *)
        echo "Usage: $0 {mode|start|stop|status|logs}" >&2
        exit 2
        ;;
esac
