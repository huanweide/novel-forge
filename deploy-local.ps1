# deploy-local.ps1  --  Novel Forge one-click local setup (Windows)
# Usage:  powershell -ExecutionPolicy Bypass -File deploy-local.ps1
# Prereqs: Docker Desktop installed & running, Node.js 20+ installed.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "MISSING: $cmd -> $hint" -ForegroundColor Red
    exit 1
  }
}

Write-Host "== Novel Forge local setup ==" -ForegroundColor Cyan
Need docker  "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
Need node    "Install Node.js 20+: https://nodejs.org/"
Need npm     "npm ships with Node.js"

# 1. start PostgreSQL
Write-Host "[1/6] Starting PostgreSQL (docker compose up -d)..." -ForegroundColor Yellow
docker compose up -d
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  if (docker exec novel-forge-db pg_isready -U novelforge 2>$null -match 'accepting') {
    $ready = $true; break
  }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  Write-Host "DB not ready. Inspect: docker logs novel-forge-db" -ForegroundColor Red
  exit 1
}
Write-Host "PostgreSQL ready." -ForegroundColor Green

# 2. .env
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env from .env.example" -ForegroundColor Green
}

# 3. LLM key + base url
$lines = Get-Content .env
$keyLine = $lines | Where-Object { $_ -match '^LLM_API_KEY=' }
$baseLine = $lines | Where-Object { $_ -match '^LLM_BASE_URL=' }
if ($keyLine -match 'LLM_API_KEY=\s*$' -or $keyLine -notmatch 'LLM_API_KEY=\S+') {
  $key = Read-Host "Enter your LLM API key (DeepSeek: https://platform.deepseek.com)"
  if ($key) { $lines = $lines -replace '^LLM_API_KEY=.*', "LLM_API_KEY=$key" }
}
if ($baseLine -match 'LLM_BASE_URL=\s*$' -or $baseLine -notmatch 'LLM_BASE_URL=\S+') {
  # default to DeepSeek official endpoint (matches .env.example default provider)
  $lines = $lines -replace '^LLM_BASE_URL=.*', 'LLM_BASE_URL=https://api.deepseek.com'
}
$lines | Set-Content .env

# 4. deps
if (-not (Test-Path node_modules)) {
  Write-Host "[4/6] npm install (first run, may take a few minutes)..." -ForegroundColor Yellow
  npm install
}

# 5. prisma
Write-Host "[5/6] prisma generate + db push..." -ForegroundColor Yellow
npx prisma generate
npx prisma db push

# 6. dev server
Write-Host "[6/6] Starting dev server -> http://localhost:3001" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
npm run dev
