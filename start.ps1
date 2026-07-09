param(
  [switch]$Restart
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        HobbyFi Copilot — Launch          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if ($Restart) {
  Get-Process -Name "node" -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -match "tsx|next" } | 
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Write-Host "Restarting services..." -ForegroundColor Yellow
}

Write-Host "[1/2] Starting Backend (port 4000)..." -ForegroundColor Green
$env:DATABASE_URL = "file:./dev.db"
$env:JWT_SECRET = "hobbyfi-dev-jwt-secret-change-in-production"
$env:PORT = 4000
$env:ALLOWED_ORIGINS = "http://localhost:3000"

$beJob = Start-Job -ScriptBlock {
  param($dir)
  Set-Location $dir
  $env:DATABASE_URL = "file:./dev.db"
  $env:JWT_SECRET = "hobbyfi-dev-jwt-secret-change-in-production"
  $env:PORT = 4000
  $env:ALLOWED_ORIGINS = "http://localhost:3000"
  npx prisma generate --no-hints
  npx tsx src/index.ts
} -ArgumentList "$root\backend"

Write-Host "[2/2] Starting Frontend (port 3000)..." -ForegroundColor Green
$feJob = Start-Job -ScriptBlock {
  param($dir)
  Set-Location $dir
  npx next dev
} -ArgumentList "$root\frontend"

Write-Host ""
Write-Host "Waiting for services..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

$backendOk = $false
$frontendOk = $false

try { $r = Invoke-WebRequest -Uri http://localhost:4000/health -UseBasicParsing -TimeoutSec 3; $backendOk = $r.StatusCode -eq 200 } catch {}
try { $r = Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing -TimeoutSec 3; $frontendOk = $r.StatusCode -eq 200 } catch {}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan

if ($backendOk) {
  Write-Host "║  Backend   http://localhost:4000    \u2713" -ForegroundColor Green
} else {
  Write-Host "║  Backend   NOT RUNNING              \u2717" -ForegroundColor Red
}

if ($frontendOk) {
  Write-Host "║  Frontend  http://localhost:3000    \u2713" -ForegroundColor Green
} else {
  Write-Host "║  Frontend  NOT RUNNING              \u2717" -ForegroundColor Red
}

Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Open http://localhost:3000 and select a demo vendor." -ForegroundColor White
Write-Host ""
Write-Host "To stop later: Get-Job | Stop-Job" -ForegroundColor Gray
