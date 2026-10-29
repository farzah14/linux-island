#!/usr/bin/env bash
# Linux Island — GNOME extension hot reload for development.
#
# Reloads GJS *and* CSS without logging out by using a small loader extension
# (uuid: island-dev@local) that imports the real extension from a fresh,
# versioned directory each time. GJS caches ES modules per URL, so a new
# directory is the only reliable way to bypass the cache in a live shell.
#
# Usage:
#   scripts/dev/dev-reload.sh install    # one-time: install loader + stage source
#   scripts/dev/dev-reload.sh reload     # stage current source, then re-enable
#   scripts/dev/dev-reload.sh status
#   scripts/dev/dev-reload.sh rollback   # re-enable the previous good generation
#   scripts/dev/dev-reload.sh uninstall
#
# Limits (verified, see docs/development-without-logout.md):
#   - UI state is reset on every reload.
#   - Old modules are never unloaded from the interpreter; only the *entry*
#     module is re-imported. Deep type/resource leaks are not fixable here.
#   - This is an experiment. The supported path is scripts/dev/dev-session.sh.
#
# Safety: never touches linux-island@local, never uses sudo, writes only under
# ~/.local/share/gnome-shell/extensions/island-dev@local and a private runtime dir.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="$ROOT_DIR/extension"
DEV_UUID="island-dev@local"
DEV_EXT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$DEV_UUID"
DEV_SESSION_STATE="${ISLAND_STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/linux-island-dev-session}"
KEEP_GENERATIONS=5

# Resolved per target: the loader reads $XDG_RUNTIME_DIR/linux-island-dev/current.txt
# *inside the target shell*, so staging must live in that shell's runtime dir.
resolve_stage_root() {
    if [ "${ISLAND_TARGET:-}" = "dev-session" ]; then
        printf '%s' "$DEV_SESSION_STATE/runtime/linux-island-dev"
    else
        printf '%s' "${XDG_RUNTIME_DIR:-}/linux-island-dev"
    fi
}

STAGE_ROOT="$(resolve_stage_root)"
POINTER="$STAGE_ROOT/current.txt"
PREVIOUS="$STAGE_ROOT/previous.txt"
LAST_GOOD="$STAGE_ROOT/last-good.txt"
LOCK="$STAGE_ROOT/reload.lock"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "$*" >&2; }

# --- preconditions ---------------------------------------------------------

require_tools() {
    command -v gnome-extensions >/dev/null || die "gnome-extensions not found (not a GNOME session?)"
    command -v flock >/dev/null || die "flock not found (util-linux)"
}

# --- target resolution -----------------------------------------------------
#
# Reload can target either the primary session (only if the loader UUID was
# discovered at shell start) or the isolated dev session started by
# dev-session.sh. Targeting is explicit to avoid touching the wrong shell.

target_bus_address() {
    if [ "${ISLAND_TARGET:-}" = "dev-session" ]; then
        [ -f "$DEV_SESSION_STATE/bus-address" ] || die "dev session is not running (no $DEV_SESSION_STATE/bus-address)"
        cat "$DEV_SESSION_STATE/bus-address"
        return 0
    fi
    printf '%s' "${DBUS_SESSION_BUS_ADDRESS:-}"
}

with_target_env() {
    local bus
    bus="$(target_bus_address)"
    [ -n "$bus" ] || die "no D-Bus address for target '${ISLAND_TARGET:-primary}'"
    if [ "${ISLAND_TARGET:-}" = "dev-session" ]; then
        DBUS_SESSION_BUS_ADDRESS="$bus" \
        XDG_RUNTIME_DIR="$DEV_SESSION_STATE/runtime" \
        XDG_CONFIG_HOME="$DEV_SESSION_STATE/config" \
        XDG_DATA_HOME="$DEV_SESSION_STATE/data" \
        DCONF_PROFILE="$DEV_SESSION_STATE/config/dconf/profile/island-dev" \
        WAYLAND_DISPLAY="$(basename "$(ls "$DEV_SESSION_STATE/runtime"/wayland-* 2>/dev/null | grep -v lock | head -1)" 2>/dev/null || true)" \
        "$@"
    else
        "$@"
    fi
}

# The staging root must be private: it holds a copy of extension source.
validate_runtime_dir() {
    local dir="$1"
    [ -n "$dir" ] || die "XDG_RUNTIME_DIR is empty; refusing to stage into /tmp"
    case "$dir" in
        /tmp|/var/tmp) die "XDG_RUNTIME_DIR points at $dir; refusing to stage there" ;;
    esac
    [ -d "$dir" ] || die "runtime dir does not exist: $dir"
    [ -O "$dir" ] || die "runtime dir is not owned by this user: $dir"
    local mode
    mode="$(stat -c '%a' "$dir")"
    case "$mode" in
        700|750) ;;
        *) die "runtime dir $dir has mode $mode; expected 0700" ;;
    esac
}

validate_target_runtime() {
    if [ "${ISLAND_TARGET:-}" = "dev-session" ]; then
        [ -d "$DEV_SESSION_STATE/runtime" ] || die "dev session runtime missing; start it first"
        validate_runtime_dir "$DEV_SESSION_STATE/runtime"
        return 0
    fi
    validate_runtime_dir "${XDG_RUNTIME_DIR:-}"
}

with_lock() {
    mkdir -p "$STAGE_ROOT"
    exec 9>"$LOCK"
    flock -n 9 || die "another reload is in progress (lock: $LOCK)"
    "$@"
}

# --- staging ---------------------------------------------------------------

declare_target_version() {
    local metadata="$1" version
    version="$(target_shell_version)"
    if [ -z "$version" ]; then
        info "WARNING: cannot read target GNOME version; staged metadata unchanged."
        return 0
    fi
    python3 "$ROOT_DIR/scripts/dev/stage-metadata.py" \
        --metadata "$metadata" --shell-version "$version" || \
        info "WARNING: failed to declare GNOME $version in $metadata"
}

target_shell_version() {
    if [ "${ISLAND_TARGET:-}" = "dev-session" ]; then
        # The dev session may run a different shell build than the primary.
        with_target_env gnome-shell --version 2>/dev/null | awk '{print $NF}'
        return 0
    fi
    gnome-shell --version 2>/dev/null | awk '{print $NF}'
}

stage_sources() {
    local stamp dir
    stamp="$(date +%s)-$$"
    dir="$STAGE_ROOT/run-$stamp"
    cp -a "$SRC_DIR/." "$dir/"
    declare_target_version "$dir/metadata.json"

    # Record the generation we are about to replace so rollback has a target.
    if [ -f "$POINTER" ]; then
        local old
        old="$(cat "$POINTER")"
        [ -d "$old" ] && printf '%s' "$old" > "$PREVIOUS"
    fi

    printf '%s' "$dir" > "$POINTER"
    info "Staged generation: $dir"

    prune_generations
}

prune_generations() {
    local current previous good
    current="$(cat "$POINTER" 2>/dev/null || true)"
    previous="$(cat "$PREVIOUS" 2>/dev/null || true)"
    good="$(cat "$LAST_GOOD" 2>/dev/null || true)"
    # Never delete the active or rollback generation.
    ls -1dt "$STAGE_ROOT"/run-* 2>/dev/null | while read -r dir; do
        [ "$dir" = "$current" ] && continue
        [ "$dir" = "$previous" ] && continue
        [ "$dir" = "$good" ] && continue
        printf '%s\n' "$dir"
    done | tail -n +"$KEEP_GENERATIONS" | while read -r old; do
        rm -rf "$old"
    done
}

# --- loader ----------------------------------------------------------------

write_loader() {
    local dest="${ISLAND_EMIT_LOADER:-$DEV_EXT_DIR}"
    mkdir -p "$dest"
    cat > "$dest/metadata.json" <<'JSON'
{
  "uuid": "island-dev@local",
  "name": "Linux Island (dev loader)",
  "description": "Development loader: re-imports Linux Island from a fresh path on every enable.",
  "shell-version": ["46", "48", "49", "50"],
  "version": 1
}
JSON

    # Install the real loader sources verbatim so tests can assert on the
    # exact artifact GNOME will load.
    local src_dir="$ROOT_DIR/scripts/dev"
    cp "$src_dir/dev-loader-extension.js" "$dest/extension.js"
    cp "$src_dir/dev-loader.js" "$dest/dev-loader.js"
}

# --- operations ------------------------------------------------------------

reload_extension() {
    with_target_env gnome-extensions disable "$DEV_UUID" >/dev/null 2>&1 || true
    sleep 0.4
    LOG_OFFSET="$(log_offset)"
    local out
    if ! out="$(with_target_env gnome-extensions enable "$DEV_UUID" 2>&1)"; then
        case "$out" in
            *"does not exist"*)
                info "The running GNOME Shell has not scanned $DEV_UUID yet."
                info "GNOME only discovers new extension UUIDs when the Shell process starts."
                info ""
                info "Pick one:"
                info "  a) Reload the loader in an isolated test shell (no logout):"
                info "       scripts/dev/dev-session.sh start"
                info "  b) Log out/in once, then 'dev-reload.sh reload' works on your session."
                info ""
                info "Existing extension files are untouched; nothing was enabled."
                return 2
                ;;
            *)
                info "$out"
                die "enable failed; check: journalctl --user -b -g island-dev"
                ;;
        esac
    fi
    wait_for_ready
}

# Number of lines already present in the target log. Readiness checks only look
# at lines after this offset so stale errors are never attributed to a new load.
log_offset() {
    local log
    log="$(target_log)"
    if [ -n "$log" ] && [ -f "$log" ]; then
        wc -l < "$log"
    else
        printf '0'
    fi
}

target_log() {
    if [ "${ISLAND_TARGET:-}" = "dev-session" ]; then
        printf '%s' "$DEV_SESSION_STATE/log/shell.log"
    fi
}

# Wait for the loader's own readiness log instead of a fixed sleep.
wait_for_ready() {
    local dir deadline
    dir="$(cat "$POINTER" 2>/dev/null || true)"
    local log offset
    log="$(target_log)"
    offset="${LOG_OFFSET:-0}"

    deadline=$((SECONDS + 10))
    while [ "$SECONDS" -lt "$deadline" ]; do
        if [ -n "$log" ] && [ -f "$log" ]; then
            local recent
            recent="$(tail -n +"$((offset + 1))" "$log" 2>/dev/null || true)"
            if printf '%s' "$recent" | grep -qF "ready from $dir"; then
                printf '%s' "$dir" > "$LAST_GOOD"
                echo "Ready: $dir"
                return 0
            fi
            if printf '%s' "$recent" | grep -qE "Linux Island dev: enable failed"; then
                info "Load failed for $dir"
                printf '%s' "$recent" | grep -E "Linux Island dev: enable failed" | tail -2 >&2
                return 1
            fi
        elif journalctl --user -b -g "Linux Island dev: generation" --no-pager -o cat 2>/dev/null \
            | grep -qF "ready from $dir"; then
            printf '%s' "$dir" > "$LAST_GOOD"
            echo "Ready: $dir"
            return 0
        fi
        sleep 0.3
    done
    info "Timed out waiting for generation $dir"
    info "--- recent loader output ---"
    if [ -n "$log" ]; then
        grep -iE "Linux Island dev|Error|CRITICAL" "$log" 2>/dev/null | tail -15 >&2 || true
    else
        journalctl --user -b -g "Linux Island dev" --no-pager 2>/dev/null | tail -20 >&2 || true
    fi
    return 1
}

cmd_install() {
    require_tools
    validate_target_runtime
    with_lock _install
}

_install() {
    write_loader
    stage_sources
    info "Loader installed: $DEV_EXT_DIR"
    reload_extension || return $?
    echo "OK. Edit extension/, then run: scripts/dev/dev-reload.sh reload"
}

# The loader lives in the target's data dir, not necessarily in ~/.local/share.
target_loader_dir() {
    if [ "${ISLAND_TARGET:-}" = "dev-session" ]; then
        printf '%s' "$DEV_SESSION_STATE/data/gnome-shell/extensions/$DEV_UUID"
    else
        printf '%s' "$DEV_EXT_DIR"
    fi
}

cmd_reload() {
    require_tools
    validate_target_runtime
    local loader_dir
    loader_dir="$(target_loader_dir)"
    [ -d "$loader_dir" ] || die "loader not installed for target '${ISLAND_TARGET:-primary}'
Start a dev session (scripts/dev/dev.sh preview) or run: dev-reload.sh install"
    with_lock _reload
}

_reload() {
    local previous
    previous="$(cat "$LAST_GOOD" 2>/dev/null || true)"
    [ -n "$previous" ] || previous="$(cat "$PREVIOUS" 2>/dev/null || true)"

    stage_sources
    if reload_extension; then
        return 0
    fi

    info ""
    info "Reload failed. The previous good generation was kept."
    if [ -n "$previous" ] && [ -d "$previous" ]; then
        info "Restoring: $previous"
        printf '%s' "$previous" > "$POINTER"
        if reload_extension; then
            info "Recovered on the previous generation."
            return 1
        fi
        info "Recovery also failed; the target shell may need a restart."
    fi
    return 1
}

cmd_rollback() {
    require_tools
    [ -f "$PREVIOUS" ] || die "no previous generation recorded"
    local previous
    previous="$(cat "$PREVIOUS")"
    [ -d "$previous" ] || die "previous generation is gone: $previous"
    with_lock _rollback "$previous"
}

_rollback() {
    local previous="$1"
    local current
    current="$(cat "$POINTER" 2>/dev/null || true)"
    printf '%s' "$current" > "$PREVIOUS"
    printf '%s' "$previous" > "$POINTER"
    info "Rolling back to: $previous"
    reload_extension || die "rollback generation failed to load"
}

cmd_uninstall() {
    if command -v gnome-extensions >/dev/null; then
        gnome-extensions disable "$DEV_UUID" >/dev/null 2>&1 || true
    fi
    rm -rf "$DEV_EXT_DIR" "$STAGE_ROOT"
    echo "Removed loader and staged generations."
}

cmd_status() {
    local loader_dir
    loader_dir="$(target_loader_dir)"
    echo "Loader dir : $loader_dir $([ -d "$loader_dir" ] && echo '(present)' || echo '(missing)')"
    echo "Stage root : $STAGE_ROOT"
    echo "Current    : $(cat "$POINTER" 2>/dev/null || echo '(none)')"
    echo "Previous   : $(cat "$PREVIOUS" 2>/dev/null || echo '(none)')"
    echo "Target     : ${ISLAND_TARGET:-primary}"
    if command -v gnome-extensions >/dev/null; then
        with_target_env gnome-extensions info "$DEV_UUID" 2>/dev/null | sed -n 's/^/  /p' || echo "  (not loaded)"
    fi
}

case "${1:-}" in
    emit-loader)
        # Internal: write the loader files to $ISLAND_EMIT_LOADER (used by dev-session.sh).
        [ -n "${ISLAND_EMIT_LOADER:-}" ] || die "ISLAND_EMIT_LOADER is required for emit-loader"
        write_loader
        ;;
    install)   cmd_install ;;
    reload)    cmd_reload ;;
    rollback)  cmd_rollback ;;
    uninstall) cmd_uninstall ;;
    status)    cmd_status ;;
    *)
        echo "Usage: $0 {install|reload|rollback|status|uninstall}" >&2
        exit 2
        ;;
esac
