param(
  [ValidateSet("prompt", "global", "isolated", "login-isolated", "login-global")]
  [string]$Mode = "prompt"
)

$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Decode-Text {
  param(
    [string]$Value
  )

  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Value))
}

function Decode-Base64UrlPayload {
  param(
    [string]$Value
  )

  $normalized = $Value.Replace("-", "+").Replace("_", "/")
  $normalized += "=" * ((4 - $normalized.Length % 4) % 4)
  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($normalized))
}

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Import-DotEnv {
  param(
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in [System.IO.File]::ReadAllLines((Resolve-Path $Path), [System.Text.Encoding]::UTF8)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $name = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Require-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "[codex-im] $Name not found. $InstallHint"
  }
  return $command.Source
}

function Resolve-CodexCommand {
  $configured = [Environment]::GetEnvironmentVariable("CODEX_IM_CODEX_COMMAND", "Process")
  if ($configured) {
    return $configured
  }

  $command = Get-Command "codex" -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "[codex-im] Set CODEX_IM_CODEX_COMMAND in .env or install codex in PATH before logging in."
  }

  return $command.Source
}

function Ensure-IsolatedCodexHome {
  param(
    [string]$RepoRoot
  )

  $isolatedCodexHome = Join-Path $RepoRoot ".codex-home"
  New-Item -ItemType Directory -Force -Path $isolatedCodexHome | Out-Null

  $isolatedConfigPath = Join-Path $isolatedCodexHome "config.toml"
  if (-not (Test-Path -LiteralPath $isolatedConfigPath)) {
    Set-Content -LiteralPath $isolatedConfigPath -Value 'cli_auth_credentials_store = "file"'
  }

  return $isolatedCodexHome
}

function Get-GlobalCodexHome {
  $processHome = [Environment]::GetEnvironmentVariable("CODEX_HOME", "Process")
  if ([string]::IsNullOrWhiteSpace($processHome)) {
    return Join-Path $env:USERPROFILE ".codex"
  }

  return $processHome.Trim()
}

function Get-AuthSummary {
  param(
    [string]$AuthPath
  )

  if (-not (Test-Path -LiteralPath $AuthPath)) {
    return [pscustomobject]@{
      ok   = $false
      path = $AuthPath
      error = Decode-Text "5pyq5om+5Yiw6K6k6K+B5paH5Lu2"
    }
  }

  try {
    $auth = Get-Content -LiteralPath $AuthPath -Raw | ConvertFrom-Json
    $payloadRaw = Decode-Base64UrlPayload $auth.tokens.id_token.Split(".")[1]
    $payload = $payloadRaw | ConvertFrom-Json
    $authInfo = $payload.'https://api.openai.com/auth'
    $defaultOrg = $authInfo.organizations | Where-Object { $_.is_default } | Select-Object -ExpandProperty title -First 1

    return [pscustomobject]@{
      ok        = $true
      path      = $AuthPath
      auth_mode = $auth.auth_mode
      email     = $payload.email
      name      = $payload.name
      plan      = $authInfo.chatgpt_plan_type
      org       = $defaultOrg
      refreshed = $auth.last_refresh
    }
  } catch {
    return [pscustomobject]@{
      ok   = $false
      path = $AuthPath
      error = "{0}: {1}" -f (Decode-Text "6K6k6K+B5L+h5oGv6K+75Y+W5aSx6LSl"), $_.Exception.Message
    }
  }
}

function Write-AuthSummary {
  param(
    [string]$Header,
    [psobject]$Summary
  )

  Write-Host ""
  Write-Host ("[{0}]" -f $Header)
  Write-Host ("{0}: {1}" -f (Decode-Text "6Lev5b6E"), $Summary.path)

  if (-not $Summary.ok) {
    Write-Host $Summary.error
    return
  }

  Write-Host ("{0}: {1}" -f (Decode-Text "55m75b2V5pa55byP"), $Summary.auth_mode)
  Write-Host ("{0}: {1}" -f (Decode-Text "6YKu566x"), $Summary.email)
  Write-Host ("{0}: {1}" -f (Decode-Text "5aeT5ZCN"), $Summary.name)
  Write-Host ("{0}: {1}" -f (Decode-Text "5aWX6aSQ"), $Summary.plan)
  Write-Host ("{0}: {1}" -f (Decode-Text "6buY6K6k57uE57uH"), $Summary.org)
  Write-Host ("{0}: {1}" -f (Decode-Text "5pyA6L+R5Yi35paw"), $Summary.refreshed)
}

function Show-AccountSummaries {
  param(
    [string]$RepoRoot
  )

  $globalAuth = Get-AuthSummary -AuthPath (Join-Path (Get-GlobalCodexHome) "auth.json")
  $isolatedAuth = Get-AuthSummary -AuthPath (Join-Path (Join-Path $RepoRoot ".codex-home") "auth.json")

  Write-Host ""
  Write-Host ("=== {0} ===" -f (Decode-Text "5b2T5YmN6LSm5Y+35pGY6KaB"))
  Write-AuthSummary -Header (Decode-Text "5YWo5bGA55m75b2V5oCB") -Summary $globalAuth
  Write-AuthSummary -Header (Decode-Text "6aG555uu6ZqU56a755m75b2V5oCB") -Summary $isolatedAuth
  Write-Host ""
  Read-Host (Decode-Text "5oyJ5Zue6L2m6L+U5Zue6I+c5Y2V") | Out-Null
}

function Show-LauncherMenu {
  Write-Host ""
  Write-Host (Decode-Text "6K+36YCJ5oupIENvZGV4IOeZu+W9leaAge+8mg==")
  Write-Host (Decode-Text "ICAxLiDnlKjlhajlsYDnmbvlvZXmgIHlkK/liqjpo57kuabliqnmiYs=")
  Write-Host (Decode-Text "ICAyLiDnlKjpobnnm67pmpTnprvnmbvlvZXmgIHlkK/liqjpo57kuabliqnmiYs=")
  Write-Host (Decode-Text "ICAzLiDnmbvlvZXpobnnm67pmpTnprsgQ29kZXgg6LSm5Y+3")
  Write-Host (Decode-Text "ICA0LiDnmbvlvZXlhajlsYAgQ29kZXgg6LSm5Y+3")
  Write-Host (Decode-Text "ICA1LiDpgIDlh7o=")
  Write-Host (Decode-Text "ICA2LiDmn6XnnIvlvZPliY3otKblj7fkv6Hmga8=")
  Write-Host ""

  while ($true) {
    $choice = Read-Host (Decode-Text "6K+36L6T5YWlIDEtNg==")
    switch ($choice.Trim()) {
      "1" { return "global" }
      "2" { return "isolated" }
      "3" { return "login-isolated" }
      "4" { return "login-global" }
      "5" { return "exit" }
      "6" { return "show-accounts" }
      default { Write-Host (Decode-Text "6L6T5YWl5peg5pWI77yM6K+36L6T5YWlIDHjgIEgMuOAgSAz44CBIDTjgIEgNSDmiJYgNuOAgg==") }
    }
  }
}

$repoRoot = Get-RepoRoot
Set-Location -LiteralPath $repoRoot

Import-DotEnv -Path (Join-Path $repoRoot ".env")

$resolvedMode = $Mode
while ($true) {
  if ($resolvedMode -eq "prompt") {
    $resolvedMode = Show-LauncherMenu
  }

  if ($resolvedMode -eq "show-accounts") {
    Show-AccountSummaries -RepoRoot $repoRoot
    $resolvedMode = "prompt"
    continue
  }

  break
}

if ($resolvedMode -eq "exit") {
  exit 0
}

Write-Host "[codex-im] Repo root: $repoRoot"

$useIsolatedHome = $resolvedMode -in @("isolated", "login-isolated")
if ($useIsolatedHome) {
  $isolatedCodexHome = Ensure-IsolatedCodexHome -RepoRoot $repoRoot
  [Environment]::SetEnvironmentVariable("CODEX_HOME", $isolatedCodexHome, "Process")
  Write-Host "[codex-im] Mode: project-isolated"
  Write-Host "[codex-im] CODEX_HOME: $isolatedCodexHome"
  Write-Host "[codex-im] Auth file: $(Join-Path $isolatedCodexHome 'auth.json')"
} else {
  [Environment]::SetEnvironmentVariable("CODEX_HOME", $null, "Process")
  Write-Host "[codex-im] Mode: global"
  Write-Host "[codex-im] CODEX_HOME: default"
}

if ($resolvedMode -in @("login-isolated", "login-global")) {
  $codexCommand = Resolve-CodexCommand
  Write-Host "[codex-im] Starting Codex login: $codexCommand"
  & $codexCommand login
  exit $LASTEXITCODE
}

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot ".env"))) {
  throw "[codex-im] .env not found in project root."
}

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))) {
  throw "[codex-im] node_modules not found. Run npm install once before first start."
}

$npmCommand = Require-Command -Name "npm.cmd" -InstallHint "Install Node.js 18+ or fix PATH."
Write-Host "[codex-im] Starting Feishu bot..."
& $npmCommand run feishu-bot
exit $LASTEXITCODE
