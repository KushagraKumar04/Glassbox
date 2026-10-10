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
