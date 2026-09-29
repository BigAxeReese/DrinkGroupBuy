# A single always-visible window that shows whether PostgreSQL / Backend / Metro (App) / Web preview
# are running on this machine, with a button per row to start or stop it. Replaces double-clicking
# 01-start-server.cmd / 02-start-app.cmd / 03-start-web.cmd / 04-start-console.cmd separately and
# reading their own console windows for status.
#
# Design: this window never re-implements what start-dev.ps1 already does -- clicking "start" on
# Backend/App/Web just launches `start-dev.ps1 -LaunchTarget <X>` as a hidden background process
# (same script the old .cmd files called) and polls the same ports start-dev.ps1 itself uses to
# decide "already running" (via dev-common.ps1, dot-sourced by both scripts so the two can't drift
# apart). Only "stop" is new: start-dev.ps1 only ever starts things.

$ErrorActionPreference = "Stop"

# Loaded before anything else risky (the dot-source below, Get-Process, etc.) so that if any of it
# throws, there's already a working MessageBox to show the error with -- 01-dev-console.cmd launches
# this hidden (-WindowStyle Hidden, so no flashing console window on the normal/success path), which
# means a startup failure with no dialog of its own would otherwise be completely silent: no window,
# no console, nothing for the user to see or report.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {

. (Join-Path $PSScriptRoot "dev-common.ps1")

$startDevScript = Join-Path $PSScriptRoot "start-dev.ps1"
$powerShellExe = (Get-Process -Id $PID).Path
$backendPort = Get-BackendPort

$logDir = Join-Path $env:TEMP "drinkgroupbuy-dev-console"
if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# --- process helpers ---------------------------------------------------------------------------
# Get-BackendProcesses comes from dev-common.ps1 (shared with scripts/update-vm-server.ps1).

function Get-PortOwningProcessId {
  param([int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($connection) { return $connection.OwningProcess }
  return $null
}

function Stop-BackendService {
  foreach ($process in @(Get-BackendProcesses)) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-PortOwner {
  param([int]$Port)
  $processId = Get-PortOwningProcessId -Port $Port
  if ($processId) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-PostgresContainer {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return }
  # No -Wait: "docker compose stop" can take several seconds (SIGTERM grace period before Docker
  # force-kills), and this runs on the click handler's call stack, i.e. the UI thread -- -Wait would
  # freeze the whole window (no repaint, no other button responds) for however long that takes. The
  # click handler's own port re-check on the next Timer tick is what actually confirms it stopped;
  # this just needs to ask Docker to stop it, not wait around for confirmation.
  Start-Process -FilePath "docker" `
    -ArgumentList @("compose", "-f", "`"$postgresComposeFile`"", "stop") `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -ErrorAction SilentlyContinue
}

# --- async actions (start-dev.ps1 launches / docker up, all logged to a file the UI tails) ------

$script:pending = @{}

function Start-AsyncProcess {
  param([string]$Key, [string]$FilePath, [string[]]$Arguments)

  if ($script:pending.ContainsKey($Key)) { return }

  $logPath = Join-Path $logDir "$Key.log"
  $errPath = Join-Path $logDir "$Key.err.log"
  foreach ($path in @($logPath, $errPath)) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  }

  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
      -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $logPath -RedirectStandardError $errPath
    # Touching .Handle right after Start-Process -PassThru forces .NET to populate the process's
    # exit-tracking handle. Without this, ExitCode reads back empty (not 0, not an error -- just
    # empty) once HasExited later becomes true, because nothing ever waited on the process with
    # -Wait. (An earlier version of this function worked around the same ExitCode problem with a
    # raw Process/ProcessStartInfo and Register-ObjectEvent-based log tailing instead -- that traded
    # one bug for a worse one: those event subscriptions leak if Start() throws, or if the console
    # window is closed while a launch is still pending, since nothing ever unregisters them in
    # either case. -RedirectStandardOutput/-RedirectStandardError writing straight to a file needs
    # no event subscriptions to leak in the first place.)
    $null = $process.Handle
    $script:pending[$Key] = @{
      Process = $process; LogPath = $logPath; ErrPath = $errPath
      LogPosition = 0; ErrPosition = 0; LogBuffer = ""; ErrBuffer = ""
    }
  } catch {
    Set-Content -LiteralPath $logPath -Value "Could not start: $_"
    $script:pending[$Key] = @{
      Process = $null; LogPath = $logPath; ErrPath = $errPath
      LogPosition = 0; ErrPosition = 0; LogBuffer = ""; ErrBuffer = ""
    }
  }
}

function Start-ServerTarget { Start-AsyncProcess -Key "Server" -FilePath $powerShellExe -Arguments @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$startDevScript`"",
  "-LaunchTarget", "Server", "-SkipCode", "-SkipBrowser"
) }
function Start-AppTarget { Start-AsyncProcess -Key "App" -FilePath $powerShellExe -Arguments @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$startDevScript`"",
  "-LaunchTarget", "App"
) }
function Start-WebTarget { Start-AsyncProcess -Key "Web" -FilePath $powerShellExe -Arguments @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$startDevScript`"",
  "-LaunchTarget", "Web"
) }
function Start-PostgresTarget {
  # Deliberately just "docker compose up -d", not the full Ensure-PostgresDatabase (which also runs
  # migrations) -- migrations stay tied to a real Backend start, same as today. This row is only for
  # getting the database container itself up, e.g. to run a query by hand without starting the API.
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $logPath = Join-Path $logDir "Postgres.log"
    Set-Content -LiteralPath $logPath -Value "Docker was not found on PATH. Install Docker Desktop, or start PostgreSQL another way (see database/README.md)."
    $script:pending["Postgres"] = @{
      Process = $null; LogPath = $logPath; ErrPath = $null
      LogPosition = 0; ErrPosition = 0; LogBuffer = ""; ErrBuffer = ""
    }
    return
  }
  Start-AsyncProcess -Key "Postgres" -FilePath "docker" -Arguments @(
    "compose", "-f", "`"$postgresComposeFile`"", "up", "-d"
  )
}

# --- window ----------------------------------------------------------------------------------

$targets = @(
  @{ Key = "Postgres"; Label = "PostgreSQL 資料庫"; Port = $postgresPort
     Start = { Start-PostgresTarget }; Stop = { Stop-PostgresContainer }; Open = $null }
  @{ Key = "Server"; Label = "後端伺服器"; Port = $backendPort
     Start = { Start-ServerTarget }; Stop = { Stop-BackendService }
     Open = @{ Label = "開啟測試控制台"; Url = "http://127.0.0.1:$backendPort/admin/dev-console" } }
  @{ Key = "App"; Label = "App 預覽 (Metro)"; Port = $metroPort
     Start = { Start-AppTarget }; Stop = { Stop-PortOwner -Port $metroPort }; Open = $null }
  @{ Key = "Web"; Label = "網頁預覽"; Port = $webPort
     Start = { Start-WebTarget }; Stop = { Stop-PortOwner -Port $webPort }
     Open = @{ Label = "開啟瀏覽器"; Url = "http://127.0.0.1:$webPort/" } }
)

$form = New-Object System.Windows.Forms.Form
$form.Text = "DrinkGroupBuy 開發控制台"
$form.Size = New-Object System.Drawing.Size(620, 500)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font("Microsoft JhengHei UI", 10)

$grid = New-Object System.Windows.Forms.TableLayoutPanel
$grid.Location = New-Object System.Drawing.Point(16, 16)
$grid.Size = New-Object System.Drawing.Size(580, 190)
$grid.ColumnCount = 4
$grid.RowCount = $targets.Count
[void]$grid.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 180)))
[void]$grid.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 110)))
[void]$grid.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 100)))
[void]$grid.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, 160)))
$form.Controls.Add($grid)

$rowControls = @{}

foreach ($target in $targets) {
  $nameLabel = New-Object System.Windows.Forms.Label
  $nameLabel.Text = "$($target.Label)  (port $($target.Port))"
  $nameLabel.AutoSize = $true
  $nameLabel.Anchor = "Left"
  $nameLabel.Margin = New-Object System.Windows.Forms.Padding(3, 10, 3, 3)

  $statusLabel = New-Object System.Windows.Forms.Label
  $statusLabel.Text = "檢查中…"
  $statusLabel.AutoSize = $true
  $statusLabel.Anchor = "Left"
  $statusLabel.Margin = New-Object System.Windows.Forms.Padding(3, 10, 3, 3)

  $toggleButton = New-Object System.Windows.Forms.Button
  $toggleButton.Text = "…"
  $toggleButton.Width = 90
  $toggleButton.Tag = $target.Key
  $toggleButton.Add_Click({
    param($sender, $eventArgs)
    $key = $sender.Tag
    $current = $targets | Where-Object { $_.Key -eq $key }
    $running = Test-TcpPort -Port $current.Port
    $logBox.Tag = $key
    if ($running) {
      $logBox.Text = "== $key ==`r`n正在停止…"
      & $current.Stop
    } else {
      $logBox.Text = "== $key ==`r`n啟動中…"
      & $current.Start
    }
  })

  $openButton = New-Object System.Windows.Forms.Button
  $openButton.Width = 140
  if ($target.Open) {
    $openButton.Text = $target.Open.Label
    $openButton.Tag = $target.Open.Url
    $openButton.Enabled = $false
    $openButton.Add_Click({
      param($sender, $eventArgs)
      Start-Process $sender.Tag
    })
  } else {
    $openButton.Visible = $false
  }

  $rowIndex = $targets.IndexOf($target)
  $grid.Controls.Add($nameLabel, 0, $rowIndex)
  $grid.Controls.Add($statusLabel, 1, $rowIndex)
  $grid.Controls.Add($toggleButton, 2, $rowIndex)
  $grid.Controls.Add($openButton, 3, $rowIndex)

  $rowControls[$target.Key] = @{ StatusLabel = $statusLabel; ToggleButton = $toggleButton; OpenButton = $openButton }
}

$logLabel = New-Object System.Windows.Forms.Label
$logLabel.Text = "最近動作記錄："
$logLabel.Location = New-Object System.Drawing.Point(16, 220)
$logLabel.AutoSize = $true
$form.Controls.Add($logLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Location = New-Object System.Drawing.Point(16, 244)
$logBox.Size = New-Object System.Drawing.Size(580, 150)
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($logBox)

$hintLabel = New-Object System.Windows.Forms.Label
$hintLabel.Text = "App／網頁預覽需要後端伺服器先啟動。關閉這個視窗不會停掉已經啟動的服務。"
$hintLabel.Location = New-Object System.Drawing.Point(16, 402)
$hintLabel.AutoSize = $true
$hintLabel.ForeColor = [System.Drawing.Color]::DimGray
$form.Controls.Add($hintLabel)

# --- polling: reflect real port status + tail whichever action is pending ----------------------

function Update-Rows {
  # One probe per port, not one extra for the backend -- $targets already has a "Server" row whose
  # Port IS $backendPort, so a second, separate Test-TcpPort -Port $backendPort call here would just
  # re-probe the same port the loop below already checks when it reaches that row.
  $serverRunning = $false
  foreach ($target in $targets) {
    $running = Test-TcpPort -Port $target.Port
    if ($target.Key -eq "Server") { $serverRunning = $running }
    $controls = $rowControls[$target.Key]
    $isPending = $script:pending.ContainsKey($target.Key)

    if ($isPending) {
      $controls.StatusLabel.Text = "啟動中…"
      $controls.StatusLabel.ForeColor = [System.Drawing.Color]::DarkOrange
      $controls.ToggleButton.Enabled = $false
      $controls.ToggleButton.Text = "…"
    } elseif ($running) {
      $controls.StatusLabel.Text = "● 運作中"
      $controls.StatusLabel.ForeColor = [System.Drawing.Color]::ForestGreen
      $controls.ToggleButton.Text = "停止"
      $controls.ToggleButton.Enabled = $true
    } else {
      $controls.StatusLabel.Text = "○ 未啟動"
      $controls.StatusLabel.ForeColor = [System.Drawing.Color]::Gray
      $controls.ToggleButton.Text = "啟動"
      # App/Web depend on the backend already running (start-dev.ps1 asserts this itself) -- grey the
      # button out instead of letting the click fail with a wall of text in the log box.
      $controls.ToggleButton.Enabled = ($target.Key -notin @("App", "Web")) -or $serverRunning
    }

    if ($target.Open) { $controls.OpenButton.Enabled = $running }
  }
}

# Reads only what was appended to $Path since $Position (not the whole file every call) -- a
# redirected process's log can grow large during a long, verbose start (e.g. npm install output),
# and re-reading + re-rendering the full thing from scratch on every 1.2s tick would waste I/O,
# string work, and TextBox redraw scaling with total log size instead of just the new tail.
# [System.Text.Encoding]::Default (not UTF8) matches what Start-Process -RedirectStandardOutput
# actually writes here -- the child's console output encoding, not UTF-8 -- confirmed empirically:
# using UTF8 would garble the Chinese text these logs contain.
function Read-NewLogContent {
  param([string]$Path, [long]$Position)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return @{ Text = ""; Position = $Position } }
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      # A file shorter than the remembered position means a new run truncated/replaced it (Start-
      # AsyncProcess removes the old file before launching) -- start over from the beginning instead
      # of a negative/invalid seek.
      if ($Position -gt $stream.Length) { $Position = 0 }
      [void]$stream.Seek($Position, [System.IO.SeekOrigin]::Begin)
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::Default)
      $newText = $reader.ReadToEnd()
      return @{ Text = $newText; Position = $stream.Position }
    } finally {
      $stream.Dispose()
    }
  } catch {
    return @{ Text = ""; Position = $Position }
  }
}

function Update-PendingLog {
  foreach ($key in @($script:pending.Keys)) {
    $state = $script:pending[$key]
    $hasExited = (-not $state.Process) -or $state.Process.HasExited

    if ($logBox.Tag -eq $key) {
      $outResult = Read-NewLogContent -Path $state.LogPath -Position $state.LogPosition
      $state.LogBuffer += $outResult.Text
      $state.LogPosition = $outResult.Position
      $errResult = Read-NewLogContent -Path $state.ErrPath -Position $state.ErrPosition
      $state.ErrBuffer += $errResult.Text
      $state.ErrPosition = $errResult.Position

      $out = $state.LogBuffer.Trim()
      $err = $state.ErrBuffer.Trim()
      # $state.Process is $null for the synthetic "Docker not found" case (Start-PostgresTarget) --
      # that's a failure, not a success, even though nothing ever ran. Everything else goes through
      # Start-AsyncProcess's Start-Process -PassThru (see its comment for why .Handle is touched),
      # which reports ExitCode reliably once HasExited is true.
      $status = if (-not $hasExited) {
        "[進行中…]"
      } elseif ($state.Process -and $state.Process.ExitCode -eq 0) {
        "[完成]"
      } else {
        "[結束，請檢查上面的訊息]"
      }
      $text = "== $key =="
      if ($out) { $text += "`r`n$out" }
      if ($err) { $text += "`r`n-- stderr --`r`n$err" }
      $logBox.Text = "$text`r`n$status"
      $logBox.SelectionStart = $logBox.Text.Length
      $logBox.ScrollToCaret()
    }

    if ($hasExited) {
      $script:pending.Remove($key)
    }
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1200
$timer.Add_Tick({
  Update-PendingLog
  Update-Rows
})
$timer.Start()

Update-Rows
$script:windowShown = $true
[void]$form.ShowDialog()
$timer.Stop()

} catch {
  # Same catch covers two different phases (see the comment where $ErrorActionPreference is set): a
  # setup failure before the window ever appeared vs. an unhandled error from a click handler or
  # timer tick while the window had already been open and working. $script:windowShown (set right
  # before ShowDialog, which blocks until the window closes) tells them apart so the message doesn't
  # claim the console "failed to start" when it had actually been running fine for a while.
  $message = if ($script:windowShown) {
    "DrinkGroupBuy 開發控制台執行時發生未預期的錯誤，視窗即將關閉：`r`n`r`n$_"
  } else {
    "DrinkGroupBuy 開發控制台無法啟動：`r`n`r`n$_"
  }
  [System.Windows.Forms.MessageBox]::Show(
    $message,
    "DrinkGroupBuy 開發控制台",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  exit 1
}
