# ==============================================================================
# Claude Pulse - Windows One-Click Installer
# Universal Multi-Protocol StatusLine & Dinotty Plugin for Claude Code
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

function Write-Color([string]$text, [ConsoleColor]$color) {
    Write-Host $text -ForegroundColor $color
}

Write-Color @"
  ____ _                 _         ____        _          
 / ___| | __ _ _   _  __| | ___   |  _ \ _   _| |___  ___ 
| |   | |/ _` | | | |/ _` |/ _ \  | |_) | | | | / __|/ _ \
| |___| | (_| | |_| | (_| |  __/  |  __/| |_| | \__ \  __/
 \____|_|\__,_|\__,_|\__,_|\___|  |_|    \__,_|_|___/\___|
                                                          
 Universal Multi-Protocol Statusline & Telemetry System
"@ Cyan

Write-Color "==> [1/4] Checking prerequisites..." Yellow
try {
    $nodeVer = node -v
    Write-Color "  ✓ Node.js detected: $nodeVer" Green
} catch {
    Write-Color "  ✗ Node.js is required but was not found in PATH." Red
    Write-Color "    Please install Node.js from https://nodejs.org first." Red
    exit 1
}

$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $ClaudeDir)) {
    New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
}

# 1. Copy statusline.cjs
Write-Color "==> [2/4] Installing statusline engine..." Yellow
$ScriptSource = Join-Path $PSScriptRoot "scripts\statusline.cjs"
$ScriptDest = Join-Path $ClaudeDir "statusline.cjs"

if (Test-Path $ScriptSource) {
    Copy-Item -Path $ScriptSource -Destination $ScriptDest -Force
    Write-Color "  ✓ Statusline engine deployed to: $ScriptDest" Green
} else {
    Write-Color "  ✗ Source script not found at $ScriptSource" Red
    exit 1
}

# 2. Update settings.json
$SettingsPath = Join-Path $ClaudeDir "settings.json"
$NormalizedPath = $ScriptDest.Replace('\', '/')

$settingsObj = [ordered]@{}
if (Test-Path $SettingsPath) {
    try {
        $raw = Get-Content -Path $SettingsPath -Raw -Encoding UTF8
        $parsed = ConvertFrom-Json $raw -AsHashtable
        if ($parsed) {
            $settingsObj = [ordered]$parsed
        }
    } catch {
        Write-Color "  ! Existing settings.json had parse warnings, creating clean backup..." Yellow
        Copy-Item -Path $SettingsPath -Destination "$SettingsPath.bak-pulse" -Force
    }
}

$settingsObj['statusLine'] = [ordered]@{
    type = "command"
    command = "node $NormalizedPath"
    padding = 0
}

$jsonOutput = ConvertTo-Json $settingsObj -Depth 32
[System.IO.File]::WriteAllText($SettingsPath, $jsonOutput, [System.Text.UTF8Encoding]::new($false))
Write-Color "  ✓ Claude Code settings updated: $SettingsPath" Green

# 3. Install Dinotty Plugin (if Dinotty is present)
Write-Color "==> [3/4] Checking Dinotty integration..." Yellow
$DinottyPluginsDir = Join-Path $env:USERPROFILE ".dinotty\plugins"
$DinottySource = Join-Path $PSScriptRoot "dinotty-plugin\agent-cache"

if (Test-Path (Join-Path $env:LOCALAPPDATA "Dinotty") -or (Test-Path (Join-Path $env:USERPROFILE ".dinotty"))) {
    $TargetPluginDir = Join-Path $DinottyPluginsDir "agent-cache"
    New-Item -ItemType Directory -Path $TargetPluginDir -Force | Out-Null
    Copy-Item -Path "$DinottySource\*" -Destination $TargetPluginDir -Recurse -Force
    Write-Color "  ✓ Dinotty plugin installed: $TargetPluginDir" Green
    Write-Color "    (Status bar icon ⚡ Cache will appear automatically in Dinotty)" DarkGray
} else {
    Write-Color "  - Dinotty not detected, skipped Dinotty plugin install." Gray
    Write-Color "    (If you install Dinotty later, re-run this script to enable it)" Gray
}

# 4. Patch CC Switch (if present)
Write-Color "==> [4/5] Checking CC Switch configuration..." Yellow
$CcSwitchDb = Join-Path $env:USERPROFILE ".cc-switch\cc-switch.db"
$PythonScript = Join-Path $PSScriptRoot "scripts\patch-ccswitch.py"

if (Test-Path $CcSwitchDb) {
    try {
        $pyCmd = Get-Command python -ErrorAction SilentlyContinue
        if ($pyCmd) {
            & python $PythonScript
        } else {
            Write-Color "  ! Python not found; skipping automatic CC Switch DB patch." Gray
            Write-Color "    Your default Claude settings are active. To lock CC Switch channels, run patch-ccswitch.py with Python." Gray
        }
    } catch {
        Write-Color "  ! CC Switch patch skipped: $($_.Exception.Message)" Yellow
    }
} else {
    Write-Color "  - CC Switch not detected, skipped." Gray
}

# 5. Upgrade Windows Terminal Appearance & Shell Prompt
Write-Color "==> [5/5] Upgrading Windows Terminal Appearance & Shell Prompt..." Yellow
$SetupTermScript = Join-Path $PSScriptRoot "scripts\setup-terminal.ps1"
if (Test-Path $SetupTermScript) {
    try {
        & $SetupTermScript
    } catch {
        Write-Color "  ! Terminal setup notice: $($_.Exception.Message)" Yellow
    }
}

Write-Color @"

=======================================================
 🎉 Installation Completed Successfully!
=======================================================
 1. Windows Terminal: Tokyo Night + Acrylic 88% + Cascadia Code
 2. Shell Prompt: Ultra-fast minimalist prompt with Git status
 3. Claude Code: Universal multi-protocol statusline
    📦 Model │ Ctx Progress │ 💾 Cache Hit Rate % │ TPS
 4. Dinotty Terminal: Live ⚡ Cache Sparkline Monitor ready!
=======================================================
"@ Green
