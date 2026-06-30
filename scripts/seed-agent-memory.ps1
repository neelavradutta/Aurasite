# Seeds agent-knowledge vault by copying markdown into the expected category layout.
# Run: powershell -File scripts/seed-agent-memory.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$vault = Join-Path $root ".cursor/memory-vault"

$categories = @("projects", "people", "decisions", "workflows", "notes")
foreach ($cat in $categories) {
  New-Item -ItemType Directory -Force -Path (Join-Path $vault $cat) | Out-Null
}

function Copy-Entry($src, $destRelative, $title) {
  if (-not (Test-Path $src)) {
    Write-Warning "Missing: $src"
    return
  }
  $dest = Join-Path $vault $destRelative
  $body = Get-Content -Path $src -Raw -Encoding UTF8
  $frontmatter = @"
---
title: $title
tags: [apnr, aurasite]
updated: $(Get-Date -Format 'yyyy-MM-dd')
---

"@
  Set-Content -Path $dest -Value ($frontmatter + $body.TrimStart()) -Encoding UTF8 -NoNewline
  Write-Host "  Wrote: $destRelative"
}

Write-Host "Seeding vault: $vault"

Copy-Entry (Join-Path $root "AGENTS.md") "projects/aurasite-apnr.md" "AURASITE APNR Project Brain"
Copy-Entry (Join-Path $root ".cursor/knowledge/02-backend-and-ai.md") "projects/backend-and-ai.md" "Backend and AI Pipeline"
Copy-Entry (Join-Path $root ".cursor/knowledge/04-theme-and-ui.md") "decisions/theme-and-ui.md" "Theme and UI Rules"
Copy-Entry (Join-Path $root ".cursor/knowledge/05-session-persistence.md") "workflows/session-persistence.md" "Session Persistence"

Write-Host ""
Write-Host "Done. Restart Cursor so agent-knowledge reloads the vault."
Write-Host "Agents should call knowledge wakeup at session start (see .cursor/rules/agent-memory.mdc)."
