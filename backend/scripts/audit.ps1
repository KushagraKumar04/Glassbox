# Backend dependency audit.
#
# Usage:
#   cd backend
#   .\scripts\audit.ps1              # report only
#   .\scripts\audit.ps1 -Fix         # attempt auto-fix (safe upgrades only)
#
# Exits non-zero if any High or Critical vulnerabilities remain after
# running — CI relies on this.

param(
    [switch]$Fix
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==> Backend dependency audit" -ForegroundColor Cyan
Write-Host ""

# Ensure we're in the backend directory
if (-not (Test-Path "requirements.txt")) {
    Write-Host "Error: run this from backend/ (requirements.txt not found)" -ForegroundColor Red
    exit 2
}

# Make sure pip-audit is available
$auditVersion = pip-audit --version 2>$null
if (-not $auditVersion) {
    Write-Host "pip-audit not installed. Installing..." -ForegroundColor Yellow
    pip install pip-audit
}

if ($Fix) {
    Write-Host "Attempting safe auto-fixes..." -ForegroundColor Yellow
    pip-audit --fix --dry-run
    # Uncomment below to actually apply fixes after reviewing the dry-run
    # pip-audit --fix
}

Write-Host ""
Write-Host "Running audit (JSON + human)..." -ForegroundColor Cyan

# JSON report for CI / logs
