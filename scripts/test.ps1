$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
$frontendModules = Join-Path $repoRoot "frontend\node_modules"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Backend virtual environment not found. Follow the README setup instructions first."
}
if (-not (Test-Path -LiteralPath $frontendModules)) {
    throw "Frontend dependencies not found. Run 'npm ci' from the frontend directory first."
}

$previousTestDatabaseUrl = $env:TEST_DATABASE_URL
if ([string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL)) {
    $env:TEST_DATABASE_URL = "postgresql+psycopg://newtonite:newtonite@localhost:5432/newtonite_test"
}

try {
    Push-Location (Join-Path $repoRoot "backend")
    try {
        & $python -m pytest -q app/tests tests
        if ($LASTEXITCODE -ne 0) {
            throw "Backend tests failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    Push-Location (Join-Path $repoRoot "frontend")
    try {
        & npm.cmd test
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend tests failed with exit code $LASTEXITCODE."
        }

        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend production build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($null -eq $previousTestDatabaseUrl) {
        Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
    }
    else {
        $env:TEST_DATABASE_URL = $previousTestDatabaseUrl
    }
}
