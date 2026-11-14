# Smoke test of the Windows installers built by the desktop-smoke workflow, on a GitHub
# Windows runner: silent NSIS install, the MSI's payload, launch, the bundled sidecar, and
# agent-store:// links handed over by the shell. Writes $env:OUT\result.txt and screenshots;
# exits non-zero if a check fails.
$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Out = if ($env:OUT) { $env:OUT } else { "$Root\out" }
$Settle = if ($env:SETTLE) { [int]$env:SETTLE } else { 15 }
$BundleDir = if ($env:BUNDLE_DIR) { $env:BUNDLE_DIR } else { "$Root\apps\cli-gui\src-tauri\target\release\bundle" }
$SkillId = 'github:vercel-labs/skills/find-skills'
$SkillSlug = 'skills-find-skills'
$McpId = 'mcp-registry:io.github.upstash/context7'
New-Item -ItemType Directory -Force $Out | Out-Null
$Result = "$Out\result.txt"
Set-Content $Result ''
$Start = Get-Date
$script:failed = $false

function Log($line) { Write-Host $line; Add-Content $Result $line }
function Check($name, [scriptblock]$test) {
  $ok = $false
  try { $ok = [bool](& $test) } catch { $ok = $false }
  if ($ok) { Log "ok: $name" } else { Log "FAIL: $name"; $script:failed = $true }
}

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
function Shot($name) {
  try {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save("$Out\windows-$name.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  } catch { Log "screenshot $name failed: $_" }
}
$Shell = New-Object -ComObject WScript.Shell
function AppProcs { @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -ieq $script:AppExe }) }
function StopApp { AppProcs | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep 3 }
# The dialog focuses Cancel; Install is the next button.
function Confirm([int]$wait = 20) {
  $p = AppProcs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) { [void]$Shell.AppActivate($p.Id) }
  Start-Sleep 1
  [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
  Start-Sleep 1
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Start-Sleep $wait
}
function OpenLink($url) { Start-Process $url; Start-Sleep $Settle }
function Enc($s) { [uri]::EscapeDataString($s) }

Push-Location "$Root\apps\cli-gui"
$Version = (bun -e "console.log(require('./src-tauri/tauri.conf.json').version)").Trim()
Pop-Location
$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$DevMode = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense
Log "expected version: $Version"
Log "Windows $([Environment]::OSVersion.VersionString); elevated: $IsAdmin; developer mode: $DevMode; session: $([Environment]::UserInteractive)"
$wv2 = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue).pv
Log "WebView2 runtime: $(if ($wv2) { $wv2 } else { 'not found in the machine-wide key' })"

$Setup = Get-ChildItem "$BundleDir\nsis\*-setup.exe" | Select-Object -First 1
$Msi = Get-ChildItem "$BundleDir\msi\*.msi" | Select-Object -First 1
Log "nsis: $($Setup.FullName)"
Log "msi: $($Msi.FullName)"
Check 'the NSIS installer was built' { $Setup }
Check 'the MSI was built' { $Msi }
if (-not $Setup) { exit 1 }
Log "installer signature: $((Get-AuthenticodeSignature $Setup.FullName).Status)"

# 1. Silent per-user install, as the setup.exe a user downloads.
$p = Start-Process $Setup.FullName -ArgumentList '/S' -Wait -PassThru
Check 'the NSIS installer exits 0' { $p.ExitCode -eq 0 }
$InstallDir = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Agent Store' } | Select-Object -First 1).InstallLocation
if (-not $InstallDir) { $InstallDir = "$env:LOCALAPPDATA\Agent Store" }
$InstallDir = $InstallDir.Trim('"')
Log "install dir: $InstallDir"
Get-ChildItem $InstallDir -Recurse | Select-Object FullName, Length | Format-Table -AutoSize | Out-String -Width 300 | Add-Content "$Out\install-tree.txt"
$script:AppExe = (Get-ChildItem "$InstallDir\*.exe" | Where-Object { $_.Name -notmatch '^(aas|uninstall)\.exe$' } | Select-Object -First 1).FullName
$Sidecar = "$InstallDir\aas.exe"
Log "app: $script:AppExe"
Check 'the install has the app' { $script:AppExe -and (Test-Path $script:AppExe) }
Check 'the install has aas.exe next to the app' { Test-Path $Sidecar }
Log "app signature: $((Get-AuthenticodeSignature $script:AppExe).Status); aas signature: $((Get-AuthenticodeSignature $Sidecar).Status)"
$Built = "$Root\apps\cli-gui\src-tauri\binaries\aas-x86_64-pc-windows-msvc.exe"
Check 'the installed aas.exe is the build output' { (Get-FileHash $Sidecar).Hash -eq (Get-FileHash $Built).Hash }
$handler = (Get-ItemProperty 'Registry::HKEY_CURRENT_USER\Software\Classes\agent-store\shell\open\command' -ErrorAction SilentlyContinue).'(default)'
Log "agent-store:// handler: $handler"
Check 'the installer registers agent-store:// to the installed app' { $handler -and $handler.Contains($script:AppExe) }

# 2. The MSI carries the same sidecar (administrative extract, nothing installed).
if ($Msi) {
  $msiDir = Join-Path $env:RUNNER_TEMP 'msi-extract'
  $m = Start-Process msiexec.exe -ArgumentList @('/a', "`"$($Msi.FullName)`"", '/qn', "TARGETDIR=`"$msiDir`"") -Wait -PassThru
  $msiAas = Get-ChildItem $msiDir -Recurse -Filter aas.exe | Select-Object -First 1
  Check 'the MSI carries the same aas.exe' { $m.ExitCode -eq 0 -and $msiAas -and (Get-FileHash $msiAas.FullName).Hash -eq (Get-FileHash $Sidecar).Hash }
}

# 3. The sidecar, the way the client spawns it, with throwaway homes.
Push-Location $Root
bun test/desktop-smoke/sidecar.ts $Sidecar $Out $Version
if ($LASTEXITCODE -ne 0) { $script:failed = $true }
Pop-Location
# PowerShell pipes a string to a native command with a CRLF line end.
$piped = '["find-skills",{"kind":"skill"}]' | & $Sidecar __rpc search - 2>&1 | Out-String
Check 'a PowerShell pipeline into aas __rpc search - succeeds' { ($piped | ConvertFrom-Json).ok -eq $true }

# 3b. The same as a standard user with developer mode off, the usual home machine: no
#     symlink privilege, so skill deployments must fall back to copies. The runner user
#     itself is an elevated admin and would always get links.
$devKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
Set-ItemProperty $devKey AllowDevelopmentWithoutDevLicense 0
$std = 'C:\as-smoke'
New-Item -ItemType Directory -Force $std | Out-Null
Copy-Item (Get-Command bun).Source, $Sidecar, "$Root\test\desktop-smoke\sidecar.ts" $std
icacls $std /grant 'Users:(OI)(CI)M' | Out-Null
$secret = ConvertTo-SecureString "As1-$([guid]::NewGuid())" -AsPlainText -Force
New-LocalUser -Name assmoke -Password $secret -AccountNeverExpires -ErrorAction Stop | Out-Null
$cred = New-Object System.Management.Automation.PSCredential('assmoke', $secret)
try {
  Start-Process cmd.exe -Credential $cred -LoadUserProfile -WorkingDirectory $std -ArgumentList '/c', "whoami /groups /priv > $std\whoami.txt" -Wait -WindowStyle Hidden
  $sp = Start-Process "$std\bun.exe" -Credential $cred -LoadUserProfile -WorkingDirectory $std -Wait -PassThru -WindowStyle Hidden `
    -ArgumentList @("$std\sidecar.ts", "$std\aas.exe", "$std\out", $Version) -RedirectStandardOutput "$std\stdout.txt" -RedirectStandardError "$std\stderr.txt"
  Log "standard user privileges: $((Select-String -Path "$std\whoami.txt" -Pattern 'SeCreateSymbolicLinkPrivilege|High Mandatory|Medium Mandatory' | ForEach-Object { $_.Line.Trim() -replace '\s+', ' ' }) -join '; ')"
  Get-Content "$std\out\result.txt" -ErrorAction SilentlyContinue | ForEach-Object { Log "[standard user] $_" }
  Copy-Item "$std\out\sidecar.txt" "$Out\sidecar-standard-user.txt" -ErrorAction SilentlyContinue
  Get-Content "$std\stderr.txt" -ErrorAction SilentlyContinue | Add-Content "$Out\sidecar-standard-user.txt"
  Check 'the sidecar checks pass as a standard user without developer mode' { $sp.ExitCode -eq 0 }
} catch {
  Log "FAIL: could not run as a standard user: $_"
  $script:failed = $true
}
if ($null -ne $DevMode) { Set-ItemProperty $devKey AllowDevelopmentWithoutDevLicense $DevMode }

# 4. First launch.
$started = Start-Process $script:AppExe -PassThru
Start-Sleep $Settle
$proc = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
Log "app after launch: $(if ($proc) { "pid $($proc.Id), window '$($proc.MainWindowTitle)'" } else { 'not running' })"
Check "the app is running $($Settle)s after launch" { $proc }
Check 'the main window is open with the app title' { $proc.MainWindowHandle -ne 0 -and $proc.MainWindowTitle -eq 'Agent Store' }
Shot '00-first-launch'
Start-Sleep 10
Check 'the app is still running 10s later' { Get-Process -Id $started.Id -ErrorAction SilentlyContinue }
StopApp

# 5. Cold start from a link the shell hands over, confirmed with the keyboard.
OpenLink "agent-store://install?id=$(Enc $SkillId)"
Shot '01-link-confirm'
Check 'a link starts the closed app' { (AppProcs).Count -ge 1 }
Confirm
Shot '02-link-installed'
$lib = "$env:USERPROFILE\.agent-store\skills\$SkillSlug"
Check "a cold-start link installs $SkillSlug" { Test-Path "$lib\.agent-store.json" }
$deployed = Get-Item "$env:USERPROFILE\.claude\skills\find-skills" -ErrorAction SilentlyContinue
Log "Claude Code skill deployment from the window: $(if ($deployed) { "$($deployed.Attributes); link type '$($deployed.LinkType)'; target '$($deployed.Target)'" } else { 'absent' })"
Check 'Claude Code gets the skill' { Test-Path "$env:USERPROFILE\.claude\skills\find-skills\SKILL.md" }
StopApp

# 6. Warm start: the second launch hands the link to the running window and exits.
Start-Process $script:AppExe | Out-Null
Start-Sleep $Settle
OpenLink "agent-store://install?id=$(Enc $McpId)"
Shot '03-warm-confirm'
Log "instances while warm: $((AppProcs).Count)"
Check 'a warm link does not leave a second instance' { (AppProcs).Count -eq 1 }
Confirm
Shot '04-warm-installed'
Check 'a warm link installs context7 for Claude Code' { (Get-Content "$env:USERPROFILE\.claude.json" -Raw -ErrorAction SilentlyContinue) -match '@upstash/context7-mcp' }
StopApp

$crashes = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $Start; Id = 1000, 1001, 1002 } -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 'app\.exe|aas\.exe|Agent Store' })
$crashes | Format-List TimeCreated, Id, ProviderName, Message | Out-String -Width 300 | Add-Content "$Out\crash-events.txt"
Check 'no crash or hang was logged for app.exe or aas.exe' { $crashes.Count -eq 0 }

Log "result: $(if ($script:failed) { 'FAIL' } else { 'PASS' })"
if ($script:failed) { exit 1 } else { exit 0 }
