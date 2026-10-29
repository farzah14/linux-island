#!/usr/bin/env python3
"""Add the running GNOME Shell major version to a *staged* metadata.json.

GNOME Shell marks an extension OUT_OF_DATE unless `shell-version` contains a
string starting with the running major version. Development staging therefore
has to declare the host version, but only in the throwaway copy — the repository
metadata keeps its audited support list.

Adding a version here does NOT mean the extension is compatible with it.
It only lets the shell attempt to load it. Compatibility must be proven by
running the extension on that version.

Usage:
    stage-metadata.py --metadata PATH --shell-version 50.1 [--quiet]

Exit codes:
    0 rewritten (or already contained the major)
    2 bad arguments / unreadable metadata
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def major_of(version: str) -> str:
    """Return the leading major component, or raise ValueError."""
    first = str(version).strip().split(".")[0]
    if not first.isdigit():
        raise ValueError(f"cannot parse shell version: {version!r}")
    return first


def declare(metadata: dict, major: str) -> tuple[dict, bool]:
    """Return (metadata, added) with `major` present in shell-version."""
    declared = metadata.get("shell-version")
    if not isinstance(declared, list):
        declared = []

    already = any(str(v).split(".")[0] == major for v in declared)
    if already:
        return metadata, False

    updated = list(declared) + [major]
    metadata["shell-version"] = updated
    return metadata, True


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--shell-version", required=True)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    path = Path(args.metadata)
    try:
        major = major_of(args.shell_version)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    try:
        metadata = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read {path}: {exc}", file=sys.stderr)
        return 2

    if not isinstance(metadata, dict):
        print(f"ERROR: {path} is not a JSON object", file=sys.stderr)
        return 2

    declared_before = list(metadata.get("shell-version") or [])
    metadata, added = declare(metadata, major)

    if added:
        path.write_text(json.dumps(metadata, indent=2) + "\n")
        if not args.quiet:
            print(
                f"staged metadata: declared shell-version {declared_before} -> "
                f"{metadata['shell-version']}",
                file=sys.stderr,
            )
            print(
                f"WARNING: GNOME {major} was not in the audited support list "
                f"{declared_before}. This only allows the shell to try loading; "
                f"compatibility on GNOME {major} is unverified.",
                file=sys.stderr,
            )
    elif not args.quiet:
        print(f"staged metadata: GNOME {major} already declared", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
