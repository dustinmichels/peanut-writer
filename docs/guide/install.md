# Install

Peanut Writer needs macOS 13 (Ventura) or later, on Apple Silicon or Intel.

## Download

1. Download [**Peanut-Writer.dmg**](https://github.com/dustinmichels/peanut-writer/releases/latest/download/Peanut-Writer.dmg).
2. Open it and drag **Peanut Writer** to **Applications**.

Older versions are on the [releases page](https://github.com/dustinmichels/peanut-writer/releases).

## Homebrew

Peanut Writer is in the [`dustinmichels/tap`](https://github.com/dustinmichels/homebrew-tap) tap. With
[Homebrew](https://brew.sh), one command adds the tap and installs the app:

```sh
brew install --cask dustinmichels/tap/peanut-writer
```

To remove it, `brew uninstall --cask peanut-writer`; add `--zap` to delete your settings and templates too.

## Updates

Peanut Writer checks for a new version when it opens and daily after, and stays quiet unless there is one (**Peanut
Writer → Check for Updates…** checks now). **Update** downloads it and **Restart & Apply** installs it; your documents
aren't touched. A copy run straight from the disk image offers to **Download** the new disk image instead.

The app updates itself, so `brew upgrade` leaves it alone.
