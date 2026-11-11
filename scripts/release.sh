#!/usr/bin/env bash
# Test, package, tag, and publish a GitHub release with the signed, notarized
# Mac app (Peanut-Writer.dmg, and Peanut-Writer.zip for in-app updates) from
# scripts/package.sh, then point the Homebrew cask at it
# (scripts/update-cask.sh). macOS only.
#
# Usage: scripts/release.sh [patch|minor|major|X.Y.Z]   (default: patch)
#   Versions come from the vX.Y.Z git tags; with none yet, a bump releases 0.1.0.
set -euo pipefail

cd "$(dirname "$0")/.."

die() { echo "release: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

usage="usage: scripts/release.sh [patch|minor|major|X.Y.Z]"
[ $# -le 1 ] || die "$usage"
bump=${1:-patch}
[[ "$bump" =~ ^(patch|minor|major|[0-9]+\.[0-9]+\.[0-9]+)$ ]] || die "$usage"

# --- Preflight: everything that can fail before anything is published ---

step "Checking git state"
if [ -n "$(git status --porcelain)" ]; then
  git status --short >&2
  die "the working tree isn't clean; commit or stash first"
fi
branch=$(git symbolic-ref --short HEAD 2>/dev/null) || die "HEAD is detached"
[ "$branch" = main ] || die "on branch '$branch'; release from main"
git remote get-url origin >/dev/null 2>&1 || die "no 'origin' remote"
git fetch --quiet --tags origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] ||
  die "main and origin/main differ; push or pull first"
gh auth status >/dev/null 2>&1 || die "gh is not logged in; run 'gh auth login'"
scripts/update-cask.sh --check

# The app is signed and notarized while packaging, before anything is tagged,
# so a failure there publishes nothing. Check its prerequisites first.
step "Checking signing and notarization"
[ "$(uname -s)" = Darwin ] || die "releases are the Mac app, which only builds on macOS"
export CODESIGN_IDENTITY=${CODESIGN_IDENTITY:-$(security find-identity -v -p codesigning |
  sed -n 's/^ *[0-9]*) [0-9A-F]* "\(Developer ID Application: .*\)"$/\1/p' | awk 'NR == 1')}
[[ "$CODESIGN_IDENTITY" == "Developer ID Application: "* ]] ||
  die "no Developer ID Application identity in the Keychain (security find-identity -v -p codesigning)"
export NOTARY_PROFILE=${NOTARY_PROFILE:-peanut-writer}
xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 ||
  die "notary profile '$NOTARY_PROFILE' doesn't work; create it with: xcrun notarytool store-credentials $NOTARY_PROFILE --apple-id <apple id> --team-id LLM5F36KYW"
echo "Signing as $CODESIGN_IDENTITY, notarizing with profile $NOTARY_PROFILE"

latest=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | awk 'NR == 1')
case "$bump" in
  patch | minor | major)
    if [ -z "$latest" ]; then
      version=0.1.0
    else
      IFS=. read -r major minor patch <<<"${latest#v}"
      case "$bump" in
        patch) version=$major.$minor.$((patch + 1)) ;;
        minor) version=$major.$((minor + 1)).0 ;;
        major) version=$((major + 1)).0.0 ;;
      esac
    fi
    ;;
  *) version=$bump ;;
esac
tag=v$version
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists"
gh release view "$tag" >/dev/null 2>&1 && die "GitHub release $tag already exists"

echo "Releasing $tag (previous: ${latest:-none}) from $(git rev-parse --short HEAD)"

step "Testing"
go test ./internal/...

step "Packaging"
scripts/package.sh "$tag"
[ -z "$(git status --porcelain)" ] || {
  git status --short >&2
  die "packaging changed tracked files; commit them and rerun"
}
for f in Peanut-Writer.dmg Peanut-Writer.zip checksums.txt; do
  [ -f "bin/release/$f" ] || die "packaging produced no $f"
done

# --- Tag and publish ---

step "Tagging $tag and publishing the GitHub release"
git tag -a "$tag" -m "Peanut Writer $version"
git push origin "$tag"
gh release create "$tag" bin/release/* --verify-tag --title "Peanut Writer $version" --generate-notes

step "Updating the Homebrew cask"
scripts/update-cask.sh "$version" ||
  die "$tag is published, but the Homebrew cask wasn't updated; rerun 'scripts/update-cask.sh $version'"

echo
echo "Released $(gh release view "$tag" --json url --jq .url)"
