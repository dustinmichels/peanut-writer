# Linux release (`scripts/release.sh`, `scripts/package.sh`)

`mise run release` publishes only the Mac app (Windows: [windows.md](windows.md)). It should also build and attach a
Linux version to the same GitHub release.

- **Build**: the Wails scaffolding is there but unused: AppImage via `build/linux/appimage/build.sh`, `.deb`/`.rpm` via
  `build/linux/nfpm/nfpm.yaml`, and `build/docker/Dockerfile.cross` for building from a Mac (Linux needs CGO for
  WebKitGTK). Decide which formats and architectures (amd64, arm64).
- **Typst inside**: each package needs the matching `typst-<triple>` binary beside the executable.
- **Asset names**: versionless like the Mac ones, added to `checksums.txt`; same rules as [windows.md](windows.md) step 6.
- **Updates**: `startUpdates` (`update.go`) runs on macOS only.
- **Spellcheck**: WebKitGTK isn't handled (`spellcheck_other.go`).
- Related app gaps (`app-and-templates.md`): `Reveal` opens the folder rather than selecting the file; Typst has no
  Linux install-location fallbacks.
