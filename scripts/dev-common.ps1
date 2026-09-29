# Shared by scripts/start-dev.ps1 and scripts/dev-console.ps1 (dot-sourced by both) so the ports,
# paths and env-file lookup can't drift between the two -- the console's "is it running" status has
# to agree with what start-dev.ps1 actually starts things on.

$projectRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $projectRoot "mobile"
$backendEnvPath = Join-Path $projectRoot "backend\.env"
$mobileEnvPath = Join-Path $mobileRoot ".env"
$postgresComposeFile = Join-Path $projectRoot "database\docker-compose.postgres.yml"
$metroPort = 8081
$webPort = 8083
$postgresPort = 5432

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Name,
    [string]$DefaultValue
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $DefaultValue
  }

  $prefix = "$Name="
  $line = Get-Content -LiteralPath $Path | Where-Object {
    $_.TrimStart().StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
  } | Select-Object -Last 1
  if (-not $line) {
    return $DefaultValue
  }

  return $line.Substring($line.IndexOf("=") + 1).Trim().Trim('"').Trim("'")
}

function Test-TcpPort {
  param([int]$Port)

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $connect = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(350)) {
      return $false
    }
    $client.EndConnect($connect)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-BackendPort {
  # -ThrowOnInvalid: start-dev.ps1 uses this when it's about to actually start the backend on this
  # port -- a misconfigured backend/.env should stop with a clear message, not silently start on the
  # wrong port. Without it (dev-console.ps1's case, just showing status), a bad PORT value falls back
  # to 3000 instead, since the console must always be able to render a status row even when the
  # config is broken -- it can't throw its way out of a Timer tick.
  param([switch]$ThrowOnInvalid)
  $portText = Get-EnvValue -Path $backendEnvPath -Name "PORT" -DefaultValue "3000"
  $port = 0
  if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    if ($ThrowOnInvalid) {
      throw "backend/.env PORT must be a valid port number. Current value: $portText"
    }
    return 3000
  }
  return $port
}

# The convention scripts/dev-console.ps1 uses to find the running backend process, deciding what
# "stop 後端伺服器" kills. scripts/update-vm-server.ps1 needs the exact same match (deciding what's
# safe to kill before npm ci/restart on the classroom VM) but keeps its own small copy rather than
# dot-sourcing this file -- it has no other reason to depend on local-dev-console state (mobile
# paths, ports, etc.), and coupling an unrelated VM-deployment workflow to this module just to share
# 4 lines isn't worth it. If the backend's start command ever changes, both copies need updating.
function Get-BackendProcesses {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'backend[\\/]server\.js' }
}
