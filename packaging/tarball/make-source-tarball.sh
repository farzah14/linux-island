#!/usr/bin/env bash
# Build a source tarball from the current HEAD plus a SHA256 sidecar.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(sed -n 's/^project(LinuxIsland VERSION \([0-9][0-9.]*\).*/\1/p' CMakeLists.txt | head -n1)"
if [[ -z "$VERSION" ]]; then
    echo "ERROR: could not read the project version from CMakeLists.txt" >&2
    exit 1
fi

OUT_DIR="${1:-build/dist}"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/linux-island-$VERSION.tar.gz"

if [[ -n "$(git status --porcelain)" ]]; then
    echo "WARNING: working tree has uncommitted changes; the tarball contains HEAD only." >&2
fi

git archive --format=tar.gz --prefix="linux-island-$VERSION/" -o "$OUT" HEAD
( cd "$OUT_DIR" && sha256sum "$(basename "$OUT")" >"$(basename "$OUT").sha256" )

echo "Wrote $OUT"
echo "Wrote $OUT.sha256"
