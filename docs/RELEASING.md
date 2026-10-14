# GitHub publication

Repository: [sloutchevsky/Flashborn-Browser](https://github.com/sloutchevsky/Flashborn-Browser).
The current application version is **1.8.0**.

## Repository contents

Publish application source, assets, build and validation scripts, tests, package
lock, README, MIT license, third-party notices and changelog. Keep dependencies,
generated installers, native runtime binaries, browser profiles, test output,
credentials and signing certificates outside the Git tree.

Historical commits and tags through v1.7.3 import retained source snapshots.
Their timestamps record the import; the changelog records original build dates.
The 1.8.0 release is a new implementation and build on that history.

## Build and verify

1. Run `npm ci`, `npm run prepare:icon` and `npm run prepare:assets`.
2. Run the unit, search summary, polish, browser and privacy checks.
3. Build the Windows x64 installer with `npm run dist`.
4. Run packaged checks with `FLASHBORN_EXE` pointing to
   `release/win-unpacked/Flashborn.exe`, including automatic native playback of
   the Embody website. Verify the packaged player against `src/legacy/runtime.json`.
5. Review changes, commit the release, and tag the exact commit `v1.8.0`.

The preparation script downloads only the pinned Clean Flash archive and checks
both archive and DLL hashes. The compatible Electron 9.4.4 host comes from the
existing Flash Browser installation; no installed browser is modified.

## Release assets

Create **Flashborn Browser 1.8.0** on tag **v1.8.0** using
[the release notes](release-notes-1.8.0.md). Attach:

- `Flashborn-Setup-1.8.0-x64.exe`: verified Windows installer.
- `Flashborn-Source-1.8.0-GitHub.zip`: clean source export from the tagged commit.
- `Flashborn-Repository-1.8.0.bundle`: complete Git history for offline cloning.
- `SHA256SUMS-1.8.0-GitHub.txt`: checksums for all three files.

Publish installers as release assets, rather than adding them to Git. Preserve
existing tags and release assets. Use the existing GitHub authentication without
putting credentials in remote URLs or source files. Verify the published tag,
release notes, asset sizes and SHA-256 digests before reporting completion.

The MIT license covers Flashborn's application source. Adobe Flash remains
proprietary; the upstream patched player and legacy host retain their notices.
Publisher metadata is Vas Sloutchevsky. The installer is unsigned and Windows
verified-publisher prompts still require a trusted code-signing certificate.

## Offline handoff

The repository bundle can be cloned without downloading dependencies:

```powershell
git clone .\Flashborn-Repository-1.8.0.bundle Flashborn-Browser
cd Flashborn-Browser
```
