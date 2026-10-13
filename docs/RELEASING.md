# GitHub publication

Repository display name: **Flashborn Browser**. GitHub repository slug:
**Flashborn-Browser**. Repository:
[sloutchevsky/Flashborn-Browser](https://github.com/sloutchevsky/Flashborn-Browser).

The application is currently version **1.7.3**. Publishing documentation and
archive history does not require rebuilding the already-verified installer.

## Repository contents

Publish the application source, assets, build and validation scripts, tests,
package lock, README, MIT license, third-party notices, changelog and archive
manifest. Experimental icon previews are explicitly marked as unshipped work.

The prepared repository has a `main` branch and tags `v1.0.0` through `v1.7.3`.
Historical commits import the corresponding retained source ZIPs. The latest
commit includes the current working source and publication documentation.
Commit dates record this import; the changelog records the original build dates.

Do not add dependencies, generated installers, runtime DLLs, browser profiles,
test output, credentials or signing certificates to the Git tree.

## Current release

Create a release named **Flashborn Browser 1.7.3** on tag **v1.7.3**. Use
[the prepared notes](release-notes-1.7.3.md). Attach:

- `Flashborn-Setup-1.7.3-x64.exe` — existing Windows installer.
- `Flashborn-Source-1.7.3-GitHub.zip` — current source with publication documentation.
- `SHA256SUMS-1.7.3-GitHub.txt` — checksums for the installer, source ZIP and repository bundle.

The installer is 168,955,715 bytes and belongs in a Release rather than Git.
Old installer versions are retained locally; the changelog and tags provide
their history without uploading every historical installer.

The application source is MIT licensed. Adobe Flash is proprietary and excluded
from MIT; the installer retains the original component and runtime notices.
The installer has publisher metadata for Vas Sloutchevsky but no Authenticode
certificate, so Windows can still show Unknown publisher.

## Offline handoff

`Flashborn-Repository-1.7.3.bundle` contains the complete prepared Git history.
It can be cloned without downloading dependencies:

```powershell
git clone .\Flashborn-Repository-1.7.3.bundle Flashborn-Browser
cd Flashborn-Browser
```

After creating an empty repository through the signed-in GitHub Chrome tab,
add its actual HTTPS URL as `origin`, then push `main` and the version tags.
Use the user's existing Git authentication or let the user complete sign-in;
do not put credentials into remote URLs or source files.

Verify the remote README, changelog, tags and latest release assets before
reporting publication complete. The bundle and source ZIP are local preparation
artifacts until that verification succeeds.
