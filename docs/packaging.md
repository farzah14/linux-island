# Packaging

All packages are produced from the same CMake install rules, so their file
layout is identical. `BUILD_TESTING=OFF` skips the test targets for package
builds.

## DEB

```bash
cmake --preset dev
cmake --build build/dev
cd build/dev && cpack -G DEB
```

The package name follows `linux-island_<version>_<arch>.deb`. `Depends` is the
hand-written QML module list plus whatever `dpkg-shlibdeps` derives from the
linked libraries.

## RPM

```bash
bash packaging/ci/build-rpm.sh
```

The script prints `SKIP: rpmbuild not installed` and exits 0 on hosts without
`rpmbuild`, so CI does not fail for a missing toolchain.

## TGZ

```bash
cd build/dev && cpack -G TGZ
```

## Arch

```bash
bash packaging/tarball/make-source-tarball.sh
cd packaging/arch && makepkg -si
```

`make-source-tarball.sh` writes `build/dist/linux-island-<version>.tar.gz` from
`HEAD` plus a `.sha256` sidecar, and warns when the working tree is dirty. The
`PKGBUILD` expects that tarball next to it (`makepkg` copies it from `SRCDEST`
or the current directory).

## Per-user install

```bash
bash packaging/dev/install-local.sh --build
```

Installs into `$HOME/.local` by default; `--prefix` changes that. The script
runs `cmake --install`, moves the systemd user unit into
`~/.config/systemd/user`, installs the autostart entry, and records every path
in `~/.local/share/linux-island/installed-files.txt`.
`--no-systemd` and `--no-autostart` skip those two optional steps.

## System-wide install from a build tree

```bash
sudo cmake --install build/dev --prefix /usr
```

## Configure options

- `-DBUILD_TESTING=OFF` — skip the test targets.
- `-DCMAKE_INSTALL_PREFIX=/usr` — install prefix baked into the package.
