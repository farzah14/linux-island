#!/usr/bin/env bash
# Linux Island — unified developer CLI.
#
# One entry point for the no-logout workflow. Every command is explicit about
# which shell it targets and never mutates the primary desktop silently.
#
# Usage:
#   scripts/dev/dev.sh doctor
#   scripts/dev/dev.sh preview
#   scripts/dev/dev.sh reload extension [--target dev-session|primary]
#   scripts/dev/dev.sh reload core      [--target dev-session|primary]
#   scripts/dev/dev.sh reload css       [--target dev-session|primary]
#   scripts/dev/dev.sh status
#   scripts/dev/dev.sh rollback
#   scripts/dev/dev.sh stop
#
# Exit codes: 0 ok, 1 failure, 2 usage/target error, 3 precondition missing.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEV_SESSION="$ROOT_DIR/scripts/dev/dev-session.sh"
DEV_RELOAD="$ROOT_DIR/scripts/dev/dev-reload.sh"
CSS_GEN="$ROOT_DIR/scripts/dev/generate-island-css.py"
CORE_BIN="$ROOT_DIR/build/dev/core/linux-island-core"
UI_BIN="$ROOT_DIR/build/dev/island-ui/linux-island-ui"
STATE="${ISLAND_STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/linux-island-dev-session}"

die() { echo "ERROR: $*" >&2; exit "${2:-1}"; }
usage() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

TARGET=""
COMMAND=""
SUB=""

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --target)
                TARGET="${2:-}"
                [ -n "$TARGET" ] || die "--target needs a value" 2
                shift 2
                ;;
            --target=*)
                TARGET="${1#--target=}"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                if [ -z "$COMMAND" ]; then COMMAND="$1"
                elif [ -z "$SUB" ]; then SUB="$1"
                else die "unexpected argument: $1" 2
                fi
                shift
                ;;
        esac
    done
}

# Target selection: explicit only for reload commands.
require_target() {
    if [ -z "$TARGET" ]; then
        if [ -f "$STATE/bus-address" ]; then
            TARGET="dev-session"
        else
            die "no target given and no dev session is running.
Start one with: scripts/dev/dev.sh preview
Or reload your daily session: scripts/dev/dev.sh reload $1 --target primary" 2
        fi
    fi
    case "$TARGET" in
        dev-session|primary) ;;
        *) die "unknown target: $TARGET (expected dev-session|primary)" 2 ;;
    esac
}

# --- doctor ----------------------------------------------------------------

cmd_doctor() {
    local failures=0
    echo "Linux Island dev doctor"
    echo "======================="

    printf '%-22s ' "repo"
    [ -f "$ROOT_DIR/CMakeLists.txt" ] && echo "ok ($ROOT_DIR)" || { echo "MISSING"; failures=$((failures+1)); }

    printf '%-22s ' "session type"
    echo "${XDG_SESSION_TYPE:-unknown} / ${XDG_CURRENT_DESKTOP:-unknown}"

    printf '%-22s ' "gnome-shell"
    local host_version host_major audited
    if command -v gnome-shell >/dev/null; then
        host_version="$(gnome-shell --version 2>/dev/null | awk '{print $NF}')"
        echo "${host_version:-version unreadable}"
    else
        echo "MISSING"; failures=$((failures+1))
    fi

    # Audited support list from the repository metadata (never the staged copy).
    printf '%-22s ' "audited versions"
    audited="$(python3 -c "
import json,sys
try:
    print(','.join(json.load(open('$ROOT_DIR/extension/metadata.json'))['shell-version']))
except Exception:
    print('unreadable')
")"
    echo "$audited"

    printf '%-22s ' "version match"
    host_major="${host_version%%.*}"
    case ",$audited," in
        *",$host_major,"*)
            echo "GNOME $host_major is audited"
            ;;
        *)
            echo "GNOME $host_major is NOT audited"
            echo "                       Runtime is unverified. Staging will declare it so the"
            echo "                       shell can load, but do not claim support."
            ;;
    esac

    printf '%-22s ' "shell mode"
    local mode
    if mode="$("$DEV_SESSION" mode 2>/dev/null)"; then
        echo "$mode"
        case "$mode" in
            headless)
                echo "                       NO VISIBLE WINDOW: this only proves the code loads."
                echo "                       For visual checks use Switch User or a VM."
                ;;
            nested)
                echo "                       Nested window available (GNOME < 49)."
                ;;
            devkit)
                echo "                       Devkit window available."
                ;;
        esac
    else
        echo "UNRESOLVED"; failures=$((failures+1))
    fi

    printf '%-22s ' "mutter-devkit"
    if [ -x /usr/libexec/mutter-devkit ] || command -v mutter-devkit >/dev/null 2>&1; then
        echo "present (visible devkit session possible)"
    else
        echo "absent (headless only; use Switch User for a visible session)"
    fi

    printf '%-22s ' "build tree"
    if [ -x "$CORE_BIN" ] && [ -x "$UI_BIN" ]; then
        echo "ok"
    else
        echo "INCOMPLETE (run: cmake --build build/dev)"; failures=$((failures+1))
    fi

    printf '%-22s ' "dev session"
    if [ -f "$STATE/bus-address" ]; then
        echo "running ($STATE)"
    else
        echo "not running"
    fi

    printf '%-22s ' "primary extension"
    if command -v gnome-extensions >/dev/null; then
        gnome-extensions info linux-island@local 2>/dev/null | awk -F': ' '/State:/{print $2; found=1} END{if(!found) print "not installed"}'
    else
        echo "gnome-extensions missing"
    fi

    printf '%-22s ' "css tokens"
    if python3 "$CSS_GEN" --check >/dev/null 2>&1; then
        echo "in sync"
    else
        echo "DRIFT (run: scripts/dev/dev.sh reload css)"
    fi

    echo
    echo "Verifiable now:"
    echo "  - extension JS/CSS load (headless proves load, not appearance)"
    echo "  - Core restart and reconnect (instanceId changes)"
    echo "  - Qt overlay build/run (its own process, no shell restart)"
    echo "Not verifiable without a visible session:"
    echo "  - layout, positioning, animation, input masking"

    echo
    if [ "$failures" -eq 0 ]; then
        echo "Result: ready (headless: load-only evidence)"
        return 0
    fi
    echo "Result: $failures problem(s)"
    return 1
}

# --- preview ---------------------------------------------------------------

cmd_preview() {
    [ -x "$DEV_SESSION" ] || die "dev-session.sh missing" 3
    "$DEV_SESSION" start
    echo
    echo "Wait for readiness with: scripts/dev/dev.sh status"
    echo "Stop with:               scripts/dev/dev.sh stop"
    echo
    echo "Note: on GNOME 49+ without mutter-devkit this runs headless (no window)."
    echo "For a visible test desktop without logging out, use Switch User."
}

# --- reload ----------------------------------------------------------------

cmd_reload() {
    local what="${SUB:-}"
    [ -n "$what" ] || die "usage: dev.sh reload {extension|core|css}" 2
    require_target "$what"

    case "$what" in
        extension) reload_extension ;;
        core)      reload_core ;;
        css)       reload_css ;;
        *) die "unknown reload target: $what" 2 ;;
    esac
}

reload_extension() {
    ISLAND_TARGET="$TARGET" "$DEV_RELOAD" reload
}

# Read instanceId from GetSnapshot. A fresh Core always mints a new UUID
# (RevisionClock), so this is proof of a new process, not just a live bus name.
core_instance_id() {
    local out
    out="$(gdbus call --session --dest io.github.linuxisland.Core \
        --object-path /io/github/linuxisland/Core \
        --method io.github.linuxisland.Core1.GetSnapshot 2>/dev/null)" || return 1
    printf '%s' "$out" | sed -n "s/.*'instanceId': <'\([^']*\)'>.*/\1/p"
}

core_revision() {
    local out
    out="$(gdbus call --session --dest io.github.linuxisland.Core \
        --object-path /io/github/linuxisland/Core \
        --method io.github.linuxisland.Core1.GetSnapshot 2>/dev/null)" || return 1
    printf '%s' "$out" | sed -n "s/.*'revision': <uint64 \([0-9]*\)>.*/\1/p"
}

wait_for_new_core() {
    local old_id="$1" timeout="${2:-15}"
    local deadline=$((SECONDS + timeout)) id
    while [ "$SECONDS" -lt "$deadline" ]; do
        if id="$(core_instance_id)" && [ -n "$id" ]; then
            if [ "$id" != "$old_id" ]; then
                local rev
                rev="$(core_revision || true)"
                echo "Core ready: new instanceId ${id:0:8}… revision ${rev:-unknown}"
                return 0
            fi
        fi
        sleep 0.25
    done
    return 1
}

reload_core() {
    [ -x "$CORE_BIN" ] || die "core binary missing: $CORE_BIN" 3
    echo "Building core..."
    cmake --build "$ROOT_DIR/build/dev" --target linux-island-core >/dev/null || die "build failed"

    if [ "$TARGET" = "dev-session" ]; then
        # The dev session owns its Core on a private bus. Capture the old id from
        # that bus so we can prove the restarted session really produced a new one.
        local old_id=""
        if [ -f "$STATE/bus-address" ]; then
            old_id="$(DBUS_SESSION_BUS_ADDRESS="$(cat "$STATE/bus-address")" core_instance_id || true)"
        fi
        echo "Dev-session Core is owned by the runner; restarting the session."
        "$DEV_SESSION" stop
        "$DEV_SESSION" start
        echo "Waiting for the new Core instance..."
        local deadline=$((SECONDS + 30)) id
        while [ "$SECONDS" -lt "$deadline" ]; do
            if [ -f "$STATE/bus-address" ]; then
                id="$(DBUS_SESSION_BUS_ADDRESS="$(cat "$STATE/bus-address")" core_instance_id || true)"
                if [ -n "$id" ] && [ "$id" != "$old_id" ]; then
                    echo "Core ready: new instanceId ${id:0:8}…"
                    return 0
                fi
            fi
            sleep 0.5
        done
        die "dev-session Core did not present a new instanceId within 30s"
    fi

    local old_id
    old_id="$(core_instance_id || true)"
    [ -n "$old_id" ] && echo "Current instanceId: ${old_id:0:8}…"

    echo "Restarting the user service..."
    if systemctl --user is-enabled --quiet linux-island-core.service 2>/dev/null; then
        cp --remove-destination "$CORE_BIN" "$HOME/.local/libexec/linux-island-core"
        systemctl --user restart linux-island-core.service || die "service restart failed"
    else
        die "linux-island-core.service is not enabled; refusing to start an untracked Core" 3
    fi

    echo "Waiting for a new instanceId and snapshot..."
    if ! wait_for_new_core "$old_id" 15; then
        die "Core did not serve a new instanceId within 15s (bus name may be alive from a stale process)"
    fi
}

# --- status / rollback / stop ----------------------------------------------

cmd_status() {
    "$DEV_SESSION" status
    echo
    if [ -f "$STATE/bus-address" ]; then
        echo "Dev session bus: $(cut -c1-60 "$STATE/bus-address")..."
        echo "Shell log      : $STATE/log/shell.log"
        local ready
        ready="$(grep -c 'ready from' "$STATE/log/shell.log" 2>/dev/null || echo 0)"
        echo "Ready loads    : $ready"
        grep -E "Linux Island dev: enable failed" "$STATE/log/shell.log" 2>/dev/null | tail -2 | sed 's/^/  ERROR: /' || true
    fi
}

cmd_rollback() {
    require_target rollback
    ISLAND_TARGET="$TARGET" "$DEV_RELOAD" rollback
}

cmd_stop() {
    "$DEV_SESSION" stop
}

# --- main ------------------------------------------------------------------

parse_args "$@"

case "$COMMAND" in
    doctor)   cmd_doctor ;;
    preview)  cmd_preview ;;
    reload)   cmd_reload ;;
    status)   cmd_status ;;
    rollback) cmd_rollback ;;
    stop)     cmd_stop ;;
    ''|help)  usage; exit 0 ;;
    *)        die "unknown command: $COMMAND" 2 ;;
esac
