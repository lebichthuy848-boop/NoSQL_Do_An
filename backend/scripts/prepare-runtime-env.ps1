$ErrorActionPreference = 'Stop'
$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$secretPath = Join-Path $backendRoot '.secrets\bootstrap.env'
$runtimePath = Join-Path $backendRoot '.env'

if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
  throw 'backend/.secrets/bootstrap.env is missing. Create operational credentials securely before continuing.'
}
if (Test-Path -LiteralPath $runtimePath) {
  throw 'backend/.env already exists; refusing to overwrite local configuration.'
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $secretPath) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $split = $line.IndexOf('=')
  $settings[$line.Substring(0, $split).Trim()] = $line.Substring($split + 1).Trim()
}
foreach ($key in @('ARANGO_URL', 'ARANGO_DATABASE', 'ARANGO_RUNTIME_USERNAME', 'ARANGO_RUNTIME_PASSWORD')) {
  if (-not $settings[$key]) { throw "Missing $key in bootstrap secret file." }
}
if ($settings['ARANGO_RUNTIME_PASSWORD'].Length -lt 24) { throw 'Runtime password must contain at least 24 characters.' }

$lines = @(
  "ARANGO_URL=$($settings['ARANGO_URL'])"
  "ARANGO_DATABASE=$($settings['ARANGO_DATABASE'])"
  "ARANGO_USERNAME=$($settings['ARANGO_RUNTIME_USERNAME'])"
  "ARANGO_PASSWORD=$($settings['ARANGO_RUNTIME_PASSWORD'])"
  'HOST=127.0.0.1'
  'PORT=39530'
  'ALLOWED_ORIGINS=http://127.0.0.1:5174'
  'NODE_ENV=development'
  'COOKIE_SECURE=false'
  'EMAIL_DELIVERY_CONFIGURED=false'
)
[System.IO.File]::WriteAllText($runtimePath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Created ignored backend/.env with runtime-only ArangoDB credentials; root credentials were not copied.'
