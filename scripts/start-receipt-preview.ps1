param([switch]$SkipCompile)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) {
  $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js is required for the isolated preview.' }
Push-Location -LiteralPath $projectPath
try {
  if (-not (Test-Path -LiteralPath '.tmp-tests/pg-validation/node_modules/@electric-sql/pglite/dist/index.js')) { throw 'The isolated PostgreSQL test runtime is missing; use the project test setup first.' }
  '{"type":"commonjs"}' | Set-Content -LiteralPath '.tmp-tests/package.json' -Encoding utf8
  if (-not $SkipCompile) {
    & $nodePath 'node_modules/typescript/bin/tsc' '-p' 'tsconfig.product-catalog-tests.json'
    if ($LASTEXITCODE -ne 0) { throw 'Preview compilation failed.' }
  }
  $logPath = Join-Path $projectPath '.tmp-tests\receipt-preview'
  New-Item -ItemType Directory -Path $logPath -Force | Out-Null
  if (-not (Get-NetTCPConnection -LocalPort 3023 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $nodePath -ArgumentList 'tests/receipt-preview/server.mjs' -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'database.log') -RedirectStandardError (Join-Path $logPath 'database-error.log')
  }
  if (-not (Get-NetTCPConnection -LocalPort 3022 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $nodePath -ArgumentList 'node_modules/vite/bin/vite.js tests/receipt-preview --config tests/receipt-preview/vite.config.ts' -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'web.log') -RedirectStandardError (Join-Path $logPath 'web-error.log')
  }
  Write-Output 'Local isolated preview: http://127.0.0.1:3022/ (synthetic data only)'
} finally { Pop-Location }
