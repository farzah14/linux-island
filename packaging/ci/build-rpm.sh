#!/usr/bin/env bash
# Build an RPM when rpmbuild is available; otherwise report SKIP and succeed so
# CI on non-RPM hosts stays green without pretending a package was produced.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rpmbuild >/dev/null 2>&1; then
    echo "SKIP: rpmbuild not installed"
    exit 0
fi

cmake -S . -B build/rpm -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTING=OFF \
    -DCMAKE_INSTALL_PREFIX=/usr
cmake --build build/rpm
(cd build/rpm && cpack -G RPM)
