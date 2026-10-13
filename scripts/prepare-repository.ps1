param(
  [string]$GitExecutable = 'git',
  [string]$OutputDirectory = '.cache/github-publish'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cacheRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.cache'))
$repository = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
if (-not $repository.StartsWith($cacheRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The import directory must be inside this project''s .cache directory.'
}
if (Test-Path -LiteralPath $repository) { throw 'Choose a new, empty import directory; existing imports are never overwritten.' }
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'docs/version-manifest.json') -Raw | ConvertFrom-Json
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
if ($manifest.currentVersion -ne $package.version) { throw 'Manifest version does not match package.json.' }
$version = $package.version
$releaseDirectory = Join-Path $projectRoot 'release'
$bundleFile = Join-Path $releaseDirectory "Flashborn-Repository-$version.bundle"
$sourceFile = Join-Path $releaseDirectory "Flashborn-Source-$version-GitHub.zip"
$checksumFile = Join-Path $releaseDirectory "SHA256SUMS-$version-GitHub.txt"
foreach ($file in @($bundleFile, $sourceFile, $checksumFile)) {
  if (Test-Path -LiteralPath $file) { throw "Release preparation already exists: $file" }
}
New-Item -ItemType Directory -Path $repository -Force | Out-Null

function Invoke-ImportGit {
  param([string[]]$Arguments)
  $result = & $GitExecutable -C $repository @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Git failed: $($Arguments -join ' ')`n$($result -join "`n")" }
  return $result
}
function Import-TargetPath {
  param([string]$RelativePath)
  $target = [System.IO.Path]::GetFullPath((Join-Path $repository $RelativePath))
  if (-not $target.StartsWith($repository + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Archive path leaves the import directory: $RelativePath"
  }
  if ($RelativePath -match '(^|[\\/])\.git([\\/]|$)') { throw 'Archive must not contain Git metadata.' }
  return $target
}
function Entry-Hash {
  param($Entry)
  $stream = $Entry.Open()
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose(); $stream.Dispose() }
}
function Verify-Archive {
  param([string]$OriginalArchive, [string]$Tag)
  $temporaryArchive = Join-Path $cacheRoot "verify-$Tag.zip"
  Invoke-ImportGit -Arguments @('archive', '--format=zip', "--output=$temporaryArchive", $Tag) | Out-Null
  $original = [System.IO.Compression.ZipFile]::OpenRead($OriginalArchive)
  $imported = [System.IO.Compression.ZipFile]::OpenRead($temporaryArchive)
  try {
    $expected = @($original.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
    $actual = @($imported.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
    if ($expected.Count -ne $actual.Count) { throw "File count mismatch for $Tag" }
    foreach ($entry in $expected) {
      $match = $imported.GetEntry($entry.FullName)
      if (-not $match -or (Entry-Hash $entry) -ne (Entry-Hash $match)) { throw "Archive mismatch for $Tag/$($entry.FullName)" }
    }
    Write-Output "Verified $Tag against its original ZIP ($($expected.Count) files)."
  } finally { $original.Dispose(); $imported.Dispose() }
}

Invoke-ImportGit -Arguments @('init', '-b', 'main') | Out-Null
Invoke-ImportGit -Arguments @('config', 'core.autocrlf', 'false') | Out-Null
Invoke-ImportGit -Arguments @('config', 'user.name', $package.author.name) | Out-Null
Invoke-ImportGit -Arguments @('config', 'user.email', $package.author.email) | Out-Null
$previousPaths = @()
foreach ($record in $manifest.versions) {
  $archivePath = Join-Path $releaseDirectory $record.archivedSource.file
  if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.archivedSource.sha256) {
    throw "Source archive checksum mismatch: $($record.version)"
  }
  $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $files = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
    $nextPaths = @($files | ForEach-Object { $_.FullName })
    foreach ($previousPath in $previousPaths) {
      if ($previousPath -notin $nextPaths) {
        $target = Import-TargetPath $previousPath
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
      }
    }
    foreach ($entry in $files) {
      $target = Import-TargetPath $entry.FullName
      New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
    $previousPaths = $nextPaths
  } finally { $archive.Dispose() }
  $snapshotPackage = Get-Content -LiteralPath (Join-Path $repository 'package.json') -Raw | ConvertFrom-Json
  if ($snapshotPackage.version -ne $record.version) { throw 'Snapshot package version mismatch.' }

  # The last import uses the current working source and publication documents.
  if ($record.version -eq $version) {
    foreach ($directory in @('src','scripts','tests','assets','previews','docs')) {
      foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -Recurse -File) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1)
        $target = Import-TargetPath $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
      }
    }
    foreach ($name in @('.gitignore','package.json','package-lock.json','README.md','LICENSE','THIRD-PARTY-NOTICES.md','CHANGELOG.md')) {
      Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination (Import-TargetPath $name) -Force
    }
  }
  Invoke-ImportGit -Arguments @('add', '--all') | Out-Null
  $message = "Import Flashborn $($record.version) archived source"
  $body = "Reconstructed from $($record.archivedSource.file). Original build date: $($record.buildDate). Source SHA-256: $($record.archivedSource.sha256). Commit timestamp records import time."
  if ($record.version -eq $version) { $body += ' Includes current source, publication documentation and unshipped preview experiments.' }
  Invoke-ImportGit -Arguments @('commit', '-m', $message, '-m', $body) | Out-Null
  Invoke-ImportGit -Arguments @('tag', '-a', "v$($record.version)", '-m', "Flashborn $($record.version); archived build $($record.buildDate). Reconstructed source import.") | Out-Null
  if ($record.version -ne $version) { Verify-Archive -OriginalArchive $archivePath -Tag "v$($record.version)" }
}

Invoke-ImportGit -Arguments @('archive', '--format=zip', "--output=$sourceFile", 'main') | Out-Null
$sourceZip = [System.IO.Compression.ZipFile]::OpenRead($sourceFile)
try {
  foreach ($entry in $sourceZip.Entries | Where-Object { -not $_.FullName.EndsWith('/') }) {
    $workingFile = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $entry.FullName))
    if (-not $workingFile.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid source path.' }
    if ((Entry-Hash $entry) -ne (Get-FileHash -LiteralPath $workingFile -Algorithm SHA256).Hash.ToLowerInvariant()) {
      throw "Current source archive mismatch: $($entry.FullName)"
    }
  }
  Write-Output "Verified current source ZIP ($($sourceZip.Entries.Count) entries, including directories)."
} finally { $sourceZip.Dispose() }
Invoke-ImportGit -Arguments @('bundle', 'create', $bundleFile, '--all') | Out-Null
Invoke-ImportGit -Arguments @('bundle', 'verify', $bundleFile) | Out-Null
$assets = @((Join-Path $releaseDirectory "Flashborn-Setup-$version-x64.exe"), $sourceFile, $bundleFile)
$checksumLines = @($assets | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + [System.IO.Path]::GetFileName($_) })
[System.IO.File]::WriteAllText($checksumFile, (($checksumLines -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
Write-Output "Prepared repository: $repository"
Write-Output "Source archive: $sourceFile"
Write-Output "Git bundle: $bundleFile"
Write-Output "Checksums: $checksumFile"
Write-Output 'Local preparation only. This script does not create or upload a GitHub repository.'
