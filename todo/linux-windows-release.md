# Linux and Windows releases (`scripts/release.sh`, `scripts/package.sh`)

`mise run release` publishes only the Mac app: `scripts/release.sh` stops unless it runs on macOS, and
`scripts/package.sh` builds only the universal `.app` (`Peanut-Writer.dmg`, `Peanut-Writer.zip`, `checksums.txt`).
It should also build and attach Linux and Windows versions to the same GitHub release.

- **Build**: the Wails scaffolding is there but unused: `build/linux` (AppImage via `appimage/build.sh`, `.deb`/`.rpm`
  via `nfpm/nfpm.yaml`), `build/windows` (NSIS installer, MSIX), and `build/docker/Dockerfile.cross` for building
  from a Mac. Decide which formats to ship and for which architectures (amd64, arm64).
- **Typst inside**: `package.sh` downloads Typst for the Mac triples only; each package needs the matching
  `typst-<triple>` binary beside the executable (where the app looks first).
- **Signing**: Windows builds are unsigned (SmartScreen warns); decide whether to sign. Linux needs none.
- **Asset names**: keep them versionless like the Mac ones, so `releases/latest/download/<name>` links work, and add
  them to `checksums.txt`. Don't rename `Peanut-Writer.zip`: the Mac updater looks for it.
- **Updates**: `startUpdates` (`update.go`) runs on macOS only; other builds never check for a newer release.
- **Docs**: `docs/guide/introduction.md` and `docs/reference/development.md` describe the Mac download and release
  only; the `release` task description in `mise.toml` says the same.
- Related app gaps (`app-and-templates.md`): `Reveal` on Linux opens the folder, and Typst has no Windows/Linux
  install-location fallbacks.
