[CmdletBinding()]
param(
  [string]$RunService = "",
  [ValidateSet("Server", "App", "Web", "Console")]
  [string]$LaunchTarget = "App",
  [int]$ServiceBackendPort = 3000,
  [switch]$SkipCode,
  [switch]$SkipBrowser,
  [switch]$SkipEmulator,
  [switch]$SkipDependencyInstall
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $projectRoot "mobile"
$backendEnvPath = Join-Path $projectRoot "backend\.env"
$mobileEnvPath = Join-Path $mobileRoot ".env"
$databasePath = Join-Path $projectRoot "database\drink-group-buy-dev.sqlite"
$appPackage = "com.drinkgroupbuy.prototype"
$metroPort = 8081
$webPort = 8083
$devConsolePort = 3100

function Write-Step {
  param([string]$Message)
  Write-Host "[DrinkGroupBuy] $Message" -ForegroundColor Cyan
}

function Invoke-NpmCommand {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )

  Push-Location $WorkingDirectory
  try {
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-ServiceMode {
  param([string]$ServiceName)

  if ($ServiceName -eq "backend") {
    $Host.UI.RawUI.WindowTitle = "DrinkGroupBuy Backend"
    Invoke-NpmCommand -WorkingDirectory $projectRoot -Arguments @("run", "backend:start")
    return
  }
  if ($ServiceName -eq "metro") {
    $Host.UI.RawUI.WindowTitle = "DrinkGroupBuy Metro"
    Invoke-NpmCommand -WorkingDirectory $mobileRoot -Arguments @("run", "start", "--", "--dev-client", "--port", "$metroPort")
    return
  }
  if ($ServiceName -eq "console") {
    $Host.UI.RawUI.WindowTitle = "DrinkGroupBuy Local Console"
    Invoke-NpmCommand -WorkingDirectory (Join-Path $projectRoot "local-dev-console") -Arguments @("start")
    return
  }
  if ($ServiceName -eq "web") {
    $Host.UI.RawUI.WindowTitle = "DrinkGroupBuy Web"
    $env:BROWSER = "none"
    $env:EXPO_PUBLIC_BACKEND_URL = "http://127.0.0.1:$ServiceBackendPort"
    $env:EXPO_PUBLIC_DEV_CONSOLE_URL = "http://127.0.0.1:$devConsolePort"
    Invoke-NpmCommand -WorkingDirectory $mobileRoot -Arguments @("run", "web")
    return
  }
  if ($ServiceName -eq "android-build") {
    $Host.UI.RawUI.WindowTitle = "DrinkGroupBuy Android Build"
    Invoke-NpmCommand -WorkingDirectory $mobileRoot -Arguments @("run", "android")
    return
  }

  throw "Unknown internal service: $ServiceName"
}

if ($RunService) {
  Invoke-ServiceMode -ServiceName $RunService
  exit 0
}

function Resolve-AndroidTool {
  param(
    [string]$CommandName,
    [string]$SdkSubPath
  )

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $sdkRoots = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA "Android\Sdk")
  ) | Where-Object { $_ } | Select-Object -Unique

  foreach ($sdkRoot in $sdkRoots) {
    $candidate = Join-Path $sdkRoot $SdkSubPath
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

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

function Wait-TcpPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-ServiceWindow {
  param(
    [string]$ServiceName,
    [int]$BackendPort = 0
  )

  $powerShellPath = (Get-Process -Id $PID).Path
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-RunService", $ServiceName
  )
  if ($BackendPort -gt 0) {
    $arguments += @("-ServiceBackendPort", "$BackendPort")
  }
  Start-Process -FilePath $powerShellPath -ArgumentList $arguments -WorkingDirectory $projectRoot | Out-Null
}

function Ensure-LocalEnvironmentFiles {
  param([string]$Target)

  $createdFiles = @()
  if (-not (Test-Path -LiteralPath $backendEnvPath)) {
    Copy-Item -LiteralPath (Join-Path $projectRoot ".env.example") -Destination $backendEnvPath
    $createdFiles += $backendEnvPath
  }
  if ($Target -in @("App", "Web") -and -not (Test-Path -LiteralPath $mobileEnvPath)) {
    Copy-Item -LiteralPath (Join-Path $mobileRoot ".env.example") -Destination $mobileEnvPath
    $createdFiles += $mobileEnvPath
  }
  if ($createdFiles.Count -eq 0) {
    return $true
  }

  Write-Host "First-time local environment files were created:" -ForegroundColor Yellow
  $createdFiles | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  $launcherName = switch ($Target) {
    "Server" { "01-start-server.cmd" }
    "App" { "02-start-app.cmd" }
    "Web" { "03-start-web.cmd" }
    "Console" { "04-start-console.cmd" }
  }
  Write-Host "Configure local keys and development auth, then double-click $launcherName again." -ForegroundColor Yellow
  Write-Host "See docs\local-development-launcher.md. Secrets must not be committed." -ForegroundColor Yellow
  return $false
}

function Ensure-NodeDependencies {
  param([string]$Target)

  if ($SkipDependencyInstall) {
    return
  }
  if ($Target -eq "Server" -and -not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    Write-Step "Installing backend dependencies with npm ci"
    Invoke-NpmCommand -WorkingDirectory $projectRoot -Arguments @("ci")
  }
  if ($Target -in @("App", "Web") -and -not (Test-Path -LiteralPath (Join-Path $mobileRoot "node_modules"))) {
    Write-Step "Installing mobile dependencies with npm ci"
    Invoke-NpmCommand -WorkingDirectory $mobileRoot -Arguments @("ci")
  }
}

function Ensure-DevelopmentDatabase {
  if (Test-Path -LiteralPath $databasePath) {
    return
  }

  Write-Step "Creating missing development database"
  Invoke-NpmCommand -WorkingDirectory $projectRoot -Arguments @("run", "db:init")
  Invoke-NpmCommand -WorkingDirectory $projectRoot -Arguments @("run", "db:seed")
}

function Open-ProjectInCode {
  if ($SkipCode) {
    return
  }

  $codeCommand = Get-Command code.cmd -ErrorAction SilentlyContinue
  if (-not $codeCommand) {
    Write-Host "[SKIP] VS Code command 'code' is not available on PATH." -ForegroundColor Yellow
    return
  }

  Start-Process -FilePath $codeCommand.Source -ArgumentList "`"$projectRoot`"" | Out-Null
}

function Start-Backend {
  param([int]$Port)

  if (Test-TcpPort -Port $Port) {
    Write-Step "Backend already uses port $Port"
    return
  }

  Write-Step "Starting backend on port $Port"
  Start-ServiceWindow -ServiceName "backend"
  if (-not (Wait-TcpPort -Port $Port -TimeoutSeconds 30)) {
    throw "Backend did not start on port $Port. Check the Backend window."
  }
}

function Assert-BackendRunning {
  param([int]$Port)

  if (Test-TcpPort -Port $Port) {
    Write-Step "Backend is ready on port $Port"
    return
  }

  throw "Backend is not running on port $Port. Double-click 01-start-server.cmd first."
}

function Start-Metro {
  if (Test-TcpPort -Port $metroPort) {
    Write-Step "Metro already uses port $metroPort"
    return
  }

  Write-Step "Starting Metro on port $metroPort"
  Start-ServiceWindow -ServiceName "metro"
  if (-not (Wait-TcpPort -Port $metroPort -TimeoutSeconds 45)) {
    throw "Metro did not start on port $metroPort. Check the Metro window."
  }
}

function Start-WebPreview {
  param([int]$BackendPort)

  if (Test-TcpPort -Port $webPort) {
    Write-Step "Expo Web already uses port $webPort"
    return
  }

  Write-Step "Starting Expo Web on port $webPort"
  Start-ServiceWindow -ServiceName "web" -BackendPort $BackendPort
  if (-not (Wait-TcpPort -Port $webPort -TimeoutSeconds 60)) {
    throw "Expo Web did not start on port $webPort. Check the Web window."
  }
}

function Start-DevConsole {
  $consoleRoot = Join-Path $projectRoot "local-dev-console"
  if (-not (Test-Path -LiteralPath (Join-Path $consoleRoot "server.js"))) {
    throw "local-dev-console is not present. It is local-only and is not included in Git."
  }
  if (-not (Test-TcpPort -Port $devConsolePort)) {
    Write-Step "Starting optional local console on port $devConsolePort"
    Start-ServiceWindow -ServiceName "console"
    if (-not (Wait-TcpPort -Port $devConsolePort -TimeoutSeconds 20)) {
      Write-Host "[WARN] Local console did not start; the main App can still run." -ForegroundColor Yellow
      throw "Local console did not start on port $devConsolePort. Check the Local Console window."
    }
  }
  return $true
}

function Get-ConnectedAndroidDevice {
  param([string]$AdbPath)

  $deviceLines = & $AdbPath devices
  $connected = @($deviceLines | ForEach-Object {
    if ($_ -match "^([^\s]+)\s+device$") {
      $matches[1]
    }
  })
  if ($env:ANDROID_SERIAL -and $connected -contains $env:ANDROID_SERIAL) {
    return $env:ANDROID_SERIAL
  }
  return $connected | Select-Object -First 1
}

function Wait-AndroidDevice {
  param(
    [string]$AdbPath,
    [int]$TimeoutSeconds = 180
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $serial = Get-ConnectedAndroidDevice -AdbPath $AdbPath
    if ($serial) {
      $bootCompleted = (& $AdbPath -s $serial shell getprop sys.boot_completed 2>$null).Trim()
      if ($bootCompleted -eq "1") {
        return $serial
      }
    }
    Start-Sleep -Seconds 2
  }
  return $null
}

function Start-OrReuseAndroidDevice {
  param(
    [string]$AdbPath,
    [string]$EmulatorPath
  )

  $serial = Get-ConnectedAndroidDevice -AdbPath $AdbPath
  if ($serial) {
    Write-Step "Using Android device $serial"
    return $serial
  }
  if ($SkipEmulator) {
    Write-Host "[SKIP] No Android device is connected and emulator startup was disabled." -ForegroundColor Yellow
    return $null
  }
  if (-not $EmulatorPath) {
    throw "Android emulator was not found. Install Android Studio or set ANDROID_HOME."
  }

  $availableAvds = @(& $EmulatorPath -list-avds | Where-Object { $_.Trim() })
  if ($availableAvds.Count -eq 0) {
    throw "No Android Virtual Device exists. Create one in Android Studio Device Manager."
  }

  $avdName = $env:DRINK_GROUP_BUY_AVD
  if (-not $avdName) {
    $avdName = $availableAvds[0]
  }
  if ($availableAvds -notcontains $avdName) {
    throw "AVD '$avdName' was not found. Available AVDs: $($availableAvds -join ', ')"
  }

  Write-Step "Starting Android emulator $avdName"
  Start-Process -FilePath $EmulatorPath -ArgumentList @("-avd", $avdName) | Out-Null
  $serial = Wait-AndroidDevice -AdbPath $AdbPath
  if (-not $serial) {
    throw "Android emulator did not finish booting within 180 seconds."
  }
  return $serial
}

function Open-AndroidApp {
  param(
    [string]$AdbPath,
    [string]$DeviceSerial
  )

  if (-not $DeviceSerial) {
    return
  }

  $packageResult = (& $AdbPath -s $DeviceSerial shell pm list packages $appPackage) -join "`n"
  if ($packageResult -match "package:$([regex]::Escape($appPackage))") {
    Write-Step "Opening installed Android App"
    & $AdbPath -s $DeviceSerial shell monkey -p $appPackage -c android.intent.category.LAUNCHER 1 | Out-Null
    return
  }

  Write-Step "App is not installed; starting the first Android build"
  Start-ServiceWindow -ServiceName "android-build"
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Install Node.js LTS and reopen this launcher."
}

Set-Location $projectRoot
if ($LaunchTarget -eq "Server") {
  Open-ProjectInCode
}
if (-not (Ensure-LocalEnvironmentFiles -Target $LaunchTarget)) {
  exit 2
}

Ensure-NodeDependencies -Target $LaunchTarget

$backendPortText = Get-EnvValue -Path $backendEnvPath -Name "PORT" -DefaultValue "3000"
$backendPort = 0
if (-not [int]::TryParse($backendPortText, [ref]$backendPort) -or $backendPort -lt 1 -or $backendPort -gt 65535) {
  throw "backend/.env PORT must be a valid port number. Current value: $backendPortText"
}

if ($LaunchTarget -eq "Server") {
  Ensure-DevelopmentDatabase
  Start-Backend -Port $backendPort

  Write-Host ""
  Write-Host "DrinkGroupBuy server environment is ready." -ForegroundColor Green
  Write-Host "Backend: http://127.0.0.1:$backendPort" -ForegroundColor Green
  Write-Host "Keep the Backend window open while using the App, Web preview, or console." -ForegroundColor Green
  exit 0
}

Assert-BackendRunning -Port $backendPort

if ($LaunchTarget -eq "Console") {
  $consoleStarted = Start-DevConsole
  if ($consoleStarted -and -not $SkipBrowser) {
    Start-Process "http://127.0.0.1:$devConsolePort/" | Out-Null
  }

  Write-Host ""
  Write-Host "DrinkGroupBuy console environment is ready." -ForegroundColor Green
  Write-Host "Backend: http://127.0.0.1:$backendPort" -ForegroundColor Green
  Write-Host "Console: http://127.0.0.1:$devConsolePort" -ForegroundColor Green
  exit 0
}

if ($LaunchTarget -eq "Web") {
  Start-WebPreview -BackendPort $backendPort
  if (-not $SkipBrowser) {
    Start-Process "http://127.0.0.1:$webPort/" | Out-Null
  }

  Write-Host ""
  Write-Host "DrinkGroupBuy Web environment is ready." -ForegroundColor Green
  Write-Host "Backend: http://127.0.0.1:$backendPort" -ForegroundColor Green
  Write-Host "Web:     http://127.0.0.1:$webPort" -ForegroundColor Green
  exit 0
}

Start-Metro

$adbPath = Resolve-AndroidTool -CommandName "adb.exe" -SdkSubPath "platform-tools\adb.exe"
$emulatorPath = Resolve-AndroidTool -CommandName "emulator.exe" -SdkSubPath "emulator\emulator.exe"
if (-not $adbPath) {
  throw "adb was not found. Install Android Studio SDK Platform-Tools or set ANDROID_HOME."
}

$deviceSerial = Start-OrReuseAndroidDevice -AdbPath $adbPath -EmulatorPath $emulatorPath
Open-AndroidApp -AdbPath $adbPath -DeviceSerial $deviceSerial

Write-Host ""
Write-Host "DrinkGroupBuy App environment is ready." -ForegroundColor Green
Write-Host "Backend: http://127.0.0.1:$backendPort" -ForegroundColor Green
Write-Host "Metro:   http://127.0.0.1:$metroPort" -ForegroundColor Green
