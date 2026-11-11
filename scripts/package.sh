#!/usr/bin/env bash
# Build the release files into bin/release: a universal (arm64 + x86_64)
# "Peanut Writer.app" with Typst inside, signed with the Developer ID
# Application identity in the Keychain, notarized and stapled, as
#   Peanut-Writer.dmg   to install (the styled Wails disk image)
#   Peanut-Writer.zip   the app alone, which the app downloads to update itself (update.go)
#   checksums.txt       SHA-256 of both, which the updater checks
# Names carry no version, so
# https://github.com/dustinmichels/peanut-writer/releases/latest/download/<name>
# always points at the newest release. macOS only.
#
# Usage: scripts/package.sh [version]   (default: dev; releases pass vX.Y.Z)
#
# Without a Developer ID identity the app is signed ad hoc and not notarized:
# fine on this Mac, blocked by Gatekeeper elsewhere. scripts/release.sh refuses
# to release in that case.
#
# Environment:
#   CODESIGN_IDENTITY  signing identity (default: the first "Developer ID Application" one)
#   NOTARY_PROFILE     notarytool keychain profile (default: peanut-writer)
set -euo pipefail

cd "$(dirname "$0")/.."

die() { echo "package: $*" >&2; exit 1; }

[ $# -le 1 ] || die "usage: scripts/package.sh [version]"
[ "$(uname -s)" = Darwin ] || die "the Mac app only builds on macOS"

version=${1:-dev}
name="Peanut Writer"
exe=peanut-writer # CFBundleExecutable in build/darwin/Info.plist
out=bin/release
work=bin/macos
cache=bin/typst # downloaded typst archives, kept between runs
app="$work/$name.app"
dmg=$out/Peanut-Writer.dmg
zip=$out/Peanut-Writer.zip
plist=build/darwin/Info.plist
notary_profile=${NOTARY_PROFILE:-peanut-writer}

identity=${CODESIGN_IDENTITY:-$(security find-identity -v -p codesigning |
  sed -n 's/^ *[0-9]*) [0-9A-F]* "\(Developer ID Application: .*\)"$/\1/p' | awk 'NR == 1')}

typst_version=$(mise current typst) || die "can't read the typst version from mise"
[[ "$typst_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "unexpected typst version '$typst_version'"

# CFBundleShortVersionString must be numeric: v1.2.3 → 1.2.3, dev → 0.0.0.
bundle_version=${version#v}
[[ "$bundle_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || bundle_version=0.0.0
min_macos=$(plutil -extract LSMinimumSystemVersion raw "$plist")

rm -rf "$out" "$work"
mkdir -p "$out" "$app/Contents/MacOS" "$app/Contents/Resources/licenses/typst" "$cache"

echo "==> Building the editor"
# Removing dist makes the task rebuild it for production even after `mise run dev`.
rm -rf frontend/dist
wails3 task common:build:frontend "BUILD_FLAGS=-tags production"

echo "==> $name.app $version"
for arch in arm64 amd64; do
  CGO_ENABLED=1 GOOS=darwin GOARCH=$arch \
    CGO_CFLAGS="-mmacosx-version-min=$min_macos" CGO_LDFLAGS="-mmacosx-version-min=$min_macos" \
    MACOSX_DEPLOYMENT_TARGET=$min_macos \
    go build -tags production -trimpath -buildvcs=false \
    -ldflags "-w -s -X main.buildVersion=$version" -o "$work/$exe-$arch" .
done
lipo -create -output "$app/Contents/MacOS/$exe" "$work/$exe-arm64" "$work/$exe-amd64"
rm "$work/$exe"-*

# Typst, found beside the executable first (internal/render).
for triple in aarch64-apple-darwin x86_64-apple-darwin; do
  archive=$cache/$typst_version-typst-$triple.tar.xz
  if [ ! -f "$archive" ]; then
    curl -fsSL -o "$archive.part" "https://github.com/typst/typst/releases/download/v$typst_version/typst-$triple.tar.xz"
    mv "$archive.part" "$archive"
  fi
  tar -xJf "$archive" -C "$work"
done
lipo -create -output "$app/Contents/MacOS/typst" \
  "$work/typst-aarch64-apple-darwin/typst" "$work/typst-x86_64-apple-darwin/typst"
cp "$work/typst-aarch64-apple-darwin/LICENSE" "$work/typst-aarch64-apple-darwin/NOTICE" \
  "$app/Contents/Resources/licenses/typst/"
rm -rf "$work"/typst-*

for bin in "$exe" typst; do
  archs=$(lipo -archs "$app/Contents/MacOS/$bin")
  [[ " $archs " == *" x86_64 "* && " $archs " == *" arm64 "* ]] || die "$bin is not universal: $archs"
  # Each must run on every macOS the app claims to. The minimum is "minos" in
  # LC_BUILD_VERSION or "version" in the older LC_VERSION_MIN_MACOSX.
  for arch in arm64 x86_64; do
    needs=$(vtool -arch "$arch" -show-build "$app/Contents/MacOS/$bin" |
      awk '$1 == "minos" || $1 == "version" { print $2; exit }')
    [ -n "$needs" ] || die "can't read the macOS $bin ($arch) needs"
    [ "$(printf '%s\n%s\n' "$needs" "$min_macos" | sort -V | tail -1)" = "$min_macos" ] ||
      die "$bin ($arch) needs macOS $needs, newer than LSMinimumSystemVersion $min_macos in $plist"
  done
done

cp build/darwin/icons.icns build/darwin/Assets.car "$app/Contents/Resources/"
cp "$plist" "$app/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$bundle_version" "$app/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$bundle_version" "$app/Contents/Info.plist"
plutil -lint -s "$app/Contents/Info.plist"
xattr -cr "$app"

# Inside-out: typst, then the app (which seals the main executable and resources).
if [ -n "$identity" ]; then
  echo "==> Signing as $identity"
  sign=(codesign --force --options runtime --timestamp --sign "$identity")
else
  echo "==> Signing ad hoc: no Developer ID Application identity in the Keychain"
  sign=(codesign --force --options runtime --sign -)
fi
"${sign[@]}" "$app/Contents/MacOS/typst"
"${sign[@]}" "$app"
codesign --verify --deep --strict --verbose=2 "$app"

echo "==> Peanut-Writer.dmg"
wails3 tool package --format dmg --name "$name" --out "$work" \
  --background build/darwin/dmg-background.png \
  --volume-icon build/darwin/icons.icns \
  --file-icon build/darwin/dmg-file-icon.icns
mv "$work/$name.dmg" "$dmg"

if [ -n "$identity" ]; then
  codesign --force --timestamp --sign "$identity" "$dmg"

  echo "==> Notarizing (this can take a few minutes)"
  result=$(xcrun notarytool submit "$dmg" --keychain-profile "$notary_profile" --wait --output-format json) ||
    die "notarytool submit failed: $result"
  id=$(plutil -extract id raw - <<<"$result")
  status=$(plutil -extract status raw - <<<"$result")
  if [ "$status" != Accepted ]; then
    xcrun notarytool log "$id" --keychain-profile "$notary_profile" >&2 || true
    die "notarization $id: $status"
  fi

  xcrun stapler staple "$dmg"
  spctl -a -t open --context context:primary-signature -vv "$dmg"
  spctl -a -t exec -vv "$app"
  # Notarizing the disk image notarized the app in it too. Its ticket, stapled
  # to the app in Peanut-Writer.zip, lets a browser-downloaded copy pass
  # Gatekeeper offline; the in-app update needs none (it isn't quarantined).
  xcrun stapler staple "$app" ||
    echo "package: warning: couldn't staple the app; Gatekeeper checks Peanut-Writer.zip's app online" >&2
else
  echo "package: warning: $dmg is not notarized; Gatekeeper blocks it on other Macs" >&2
fi

# The app alone at the top level, as the updater requires, and without
# AppleDouble files for extended attributes, which would break its seal.
echo "==> Peanut-Writer.zip"
ditto -c -k --norsrc --noextattr --noacl --keepParent "$app" "$zip"

(cd "$out" && shasum -a 256 Peanut-Writer.dmg Peanut-Writer.zip >checksums.txt)
echo
echo "Release files for $version in $out:"
ls -lh "$out"
