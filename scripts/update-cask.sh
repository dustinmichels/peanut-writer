#!/usr/bin/env bash
# Point the Homebrew cask in dustinmichels/homebrew-tap at a published GitHub release.
#
# Usage: scripts/update-cask.sh [X.Y.Z | --check]
#   Hashes Peanut-Writer.dmg as GitHub serves it from release v<X.Y.Z> (default: the latest release)
#   and commits the new version and sha256 to Casks/peanut-writer.rb, creating the cask if the tap
#   has none yet. Does nothing if they already match.
#   --check only verifies that gh can push to the tap.
set -euo pipefail

cd "$(dirname "$0")/.."

TAP_REPO=dustinmichels/homebrew-tap
CASK=Casks/peanut-writer.rb
ASSET=Peanut-Writer.dmg
api="repos/$TAP_REPO/contents/$CASK"

die() { echo "update-cask: $*" >&2; exit 1; }

[ $# -le 1 ] || die "usage: scripts/update-cask.sh [X.Y.Z | --check]"

if [ "${1:-}" = --check ]; then
  [ "$(gh api "repos/$TAP_REPO" --jq .permissions.push 2>/dev/null)" = true ] || die "gh can't push to $TAP_REPO"
  exit 0
fi

if [ $# -eq 1 ]; then
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "bad version '$1'"
  tag="v$1"
else
  tag=$(gh release view --json tagName --jq .tagName) || die "couldn't find the latest release"
fi
version=${tag#v}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

gh release download "$tag" --pattern "$ASSET" --dir "$tmp" || die "couldn't download $ASSET from release $tag"
sha=$(shasum -a 256 "$tmp/$ASSET" | awk '{ print $1 }')

if blob=$(gh api "$api" --jq .sha 2>/dev/null); then
  gh api "$api" -H "Accept: application/vnd.github.raw+json" >"$tmp/old.rb"
  sed -E -e "s/^(  version ).*/\1\"$version\"/" -e "s/^(  sha256 ).*/\1\"$sha\"/" "$tmp/old.rb" >"$tmp/new.rb"
  grep -qx "  version \"$version\"" "$tmp/new.rb" && grep -qx "  sha256 \"$sha\"" "$tmp/new.rb" ||
    die "$CASK has no '  version' or '  sha256' line to update"
  if cmp -s "$tmp/old.rb" "$tmp/new.rb"; then
    echo "$TAP_REPO already points at Peanut Writer $version"
    exit 0
  fi
  gh api -X PUT "$api" --silent -f message="peanut-writer $version" \
    -f content="$(base64 -i "$tmp/new.rb")" -f sha="$blob"
  echo "Updated $TAP_REPO to Peanut Writer $version"
  exit 0
fi

# No cask yet: write one. The macOS it needs comes from the app's Info.plist.
min_macos=$(plutil -extract LSMinimumSystemVersion raw build/darwin/Info.plist)
case "${min_macos%%.*}" in
  12) macos=monterey ;;
  13) macos=ventura ;;
  14) macos=sonoma ;;
  15) macos=sequoia ;;
  *) die "no Homebrew name for macOS $min_macos; add it to scripts/update-cask.sh" ;;
esac
cat >"$tmp/new.rb" <<EOF
cask "peanut-writer" do
  version "$version"
  sha256 "$sha"

  url "https://github.com/dustinmichels/peanut-writer/releases/download/v#{version}/Peanut-Writer.dmg"
  name "Peanut Writer"
  desc "Word processor that writes Markdown, with Typst preview and PDF and Word export"
  homepage "https://dustinmichels.github.io/peanut-writer/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: :$macos

  app "Peanut Writer.app"

  uninstall quit: "com.dustinmichels.peanutwriter"

  zap trash: [
    "~/Library/Application Support/Peanut Writer",
    "~/Library/Caches/com.dustinmichels.peanutwriter",
    "~/Library/WebKit/com.dustinmichels.peanutwriter",
  ]
end
EOF
gh api -X PUT "$api" --silent -f message="peanut-writer $version (new cask)" \
  -f content="$(base64 -i "$tmp/new.rb")"
echo "Added $CASK to $TAP_REPO for Peanut Writer $version"
