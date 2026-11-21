[CmdletBinding()]
param(
  [ValidateSet('backup', 'list', 'verify')]
  [string]$Action = 'list',
  [string]$BackupName
)

$ErrorActionPreference = 'Stop'
$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupRoot = Join-Path $backendRoot '.backups'
$indexPath = Join-Path $backupRoot 'index.json'
$databaseContainer = 'skillgraph-v366-backend-operational-20261120'

function Read-History {
  if (-not (Test-Path -LiteralPath $indexPath)) { return @() }
  $raw = Get-Content -LiteralPath $indexPath -Raw
  if (-not $raw.Trim()) { return @() }
  return @($raw | ConvertFrom-Json)
}

function Get-ArchiveInfo([string]$Name) {
  $entry = (Read-History | Where-Object { $_.name -eq $Name } | Select-Object -First 1)
  if (-not $entry) { throw 'Backup record not found in the local backup history.' }
  $path = Join-Path $backupRoot $entry.name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Backup archive is missing.' }
  $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $entry.sha256.ToLowerInvariant()) { throw 'Backup SHA256 does not match its history record.' }
  $listing = & tar.exe -tzf $path 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $listing -or -not ($listing | Where-Object { $_ -match '\.structure\.json$' }) -or -not ($listing | Where-Object { $_ -match '\.data\.json(\.gz)?$' })) {
    throw 'Archive is unreadable or is missing ArangoDB collection structure/data files.'
  }
  return [pscustomobject]@{ entry = $entry; path = $path; sha256 = $actualHash; files = @($listing).Count }
}

if ($Action -eq 'list') {
  $history = Read-History
  if (-not $history.Count) { Write-Output 'No backend backup records found.'; exit 0 }
  $history | Select-Object name, createdAt, database, bytes, sha256, status | Format-Table -AutoSize
  exit 0
}

if ($Action -eq 'verify') {
  if (-not $BackupName) { throw 'Pass -BackupName with a name returned by the list action.' }
  $result = Get-ArchiveInfo $BackupName
  Write-Output ('VERIFY_PASS name=' + $result.entry.name + ' bytes=' + $result.entry.bytes + ' files=' + $result.files + ' sha256=' + $result.sha256)
  exit 0
}

if ($Action -eq 'backup') {
  $envPath = Join-Path $backendRoot '.env'
  if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw 'Runtime-only backend/.env is required; do not use root credentials for the application backup.' }
  $settings = @{}
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $split = $line.IndexOf('=')
    $settings[$line.Substring(0, $split).Trim()] = $line.Substring($split + 1).Trim()
  }
  foreach ($key in @('ARANGO_DATABASE', 'ARANGO_USERNAME', 'ARANGO_PASSWORD')) {
    if (-not $settings[$key]) { throw "$key is required in backend/.env." }
  }

  $containerState = docker inspect --format '{{.State.Status}}' $databaseContainer 2>$null
  if ($LASTEXITCODE -ne 0 -or $containerState.Trim() -ne 'running') { throw 'The dedicated authenticated operational ArangoDB container is not running.' }

  $suffix = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmssfff') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
  $dumpName = "sgbackup_$suffix"
  $archiveName = "$dumpName.tar.gz"
  $archivePath = Join-Path $backupRoot $archiveName
  $stagePath = Join-Path $backupRoot ".staging_$suffix"
  if ((Test-Path -LiteralPath $archivePath) -or (Test-Path -LiteralPath $stagePath)) { throw 'Generated backup path already exists; refusing to overwrite.' }
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $stagePath | Out-Null

  try {
    docker exec $databaseContainer arangodump `
      "--server.endpoint=tcp://127.0.0.1:8529" `
      "--server.authentication=true" `
      "--server.username=$($settings['ARANGO_USERNAME'])" `
      "--server.password=$($settings['ARANGO_PASSWORD'])" `
      "--server.database=$($settings['ARANGO_DATABASE'])" `
      '--include-system-collections=true' `
      "--output-directory=/tmp/$dumpName" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'ArangoDB dump failed; no backup was recorded.' }

    docker cp "${databaseContainer}:/tmp/$dumpName" $stagePath 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy the dump to the local backend backup directory.' }

    & tar.exe -czf $archivePath -C $stagePath $dumpName 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the compressed backup archive.' }

    $temporaryEntry = [pscustomobject]@{
      name = $archiveName
      createdAt = (Get-Date).ToUniversalTime().ToString('o')
      database = $settings['ARANGO_DATABASE']
      bytes = (Get-Item -LiteralPath $archivePath).Length
      sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
      status = 'created'
    }
    $history = @(Read-History) + @($temporaryEntry)
    $json = ConvertTo-Json -InputObject $history -Depth 5
    [System.IO.File]::WriteAllText($indexPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

    $verified = Get-ArchiveInfo $archiveName
    Write-Output ('BACKUP_CREATED name=' + $archiveName + ' bytes=' + $temporaryEntry.bytes + ' sha256=' + $verified.sha256)
  } finally {
    if ($dumpName -match '^sgbackup_[0-9A-Za-z-]+$') {
      docker exec $databaseContainer rm -rf -- "/tmp/$dumpName" 2>$null | Out-Null
    }
    $resolvedStage = (Resolve-Path -LiteralPath $stagePath -ErrorAction SilentlyContinue).Path
    if ($resolvedStage -and $resolvedStage.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedStage).StartsWith('.staging_')) {
      Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
  }
}
