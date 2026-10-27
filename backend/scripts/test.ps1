<#
.SYNOPSIS
    Run the Glassbox backend test suite.

.EXAMPLE
    .\scripts\test.ps1
    .\scripts\test.ps1 -Coverage
    .\scripts\test.ps1 -PytestArgs tests/test_api_smoke.py
#>
param(
    [switch]$Coverage,
    [string[]]$PytestArgs = @()
)

$ErrorActionPreference = "Stop"

$BackendDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $BackendDir

$Activate = Join-Path $BackendDir ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $Activate)) {
    Write-Host "No .venv found at $BackendDir\.venv" -ForegroundColor Red
    Write-Host "Create it first:  python -m venv .venv" -ForegroundColor Yellow
    exit 1
}

& $Activate

Write-Host "Installing dev requirements..." -ForegroundColor Cyan
pip install -q -r requirements-dev.txt

$args = @("tests", "-v", "--tb=short")
if ($Coverage) {
    $args += @("--cov=app", "--cov-report=term-missing",
               "--cov-report=html:htmlcov")
}
if ($PytestArgs.Count -gt 0) {
    $args = $PytestArgs + @("-v", "--tb=short")
}

Write-Host ""
Write-Host "Running: python -m pytest $($args -join ' ')" -ForegroundColor Cyan
Write-Host ""

python -m pytest @args
$exit = $LASTEXITCODE

if ($Coverage) {
    Write-Host ""
    Write-Host "HTML coverage: $BackendDir\htmlcov\index.html" -ForegroundColor Green
}

exit $exit