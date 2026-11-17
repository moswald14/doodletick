# SPDX-License-Identifier: GPL-3.0-only
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$CoreBin,
  [Parameter(Mandatory=$true)][string]$KeeperSource,
  [Parameter(Mandatory=$true)][string]$TestData
)
$ErrorActionPreference = 'Stop'
$corePath = (Resolve-Path -LiteralPath $CoreBin).Path
$sourcePath = (Resolve-Path -LiteralPath $KeeperSource).Path
$daemon = Join-Path $corePath 'pepecoind.exe'
$client = Join-Path $corePath 'pepecoin-cli.exe'
$keeper = Join-Path $sourcePath 'keeper/server.mjs'
foreach ($file in @($daemon, $client, $keeper)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required file missing: $file" }
}
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$dataInput = if ([System.IO.Path]::IsPathRooted($TestData)) { $TestData } else { Join-Path (Get-Location).Path $TestData }
$dataPath = [System.IO.Path]::GetFullPath($dataInput)
if (Test-Path -LiteralPath $dataPath) { throw 'Choose a new empty test-data directory. Existing wallets are never reused by this launcher.' }
New-Item -ItemType Directory -Path $dataPath | Out-Null
$chainPath = Join-Path $dataPath 'core'
$keeperPath = Join-Path $dataPath 'keeper'
New-Item -ItemType Directory -Path $chainPath | Out-Null
# Quoted argument boundaries are required for folders containing spaces.
if ($chainPath.Contains('"')) { throw 'Invalid data directory.' }
$arguments = @('-regtest', '-server=1', '-listen=1', '-bind=127.0.0.1', '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1', '-dnsseed=0', '-discover=0', '-upnp=0', ('-datadir="' + $chainPath + '"'))
$process = Start-Process -FilePath $daemon -ArgumentList $arguments -WindowStyle Hidden -PassThru
$oldSettings = @{}
foreach ($name in @('DVC_CORE_NETWORK','DVC_CORE_RPC_URL','DVC_CORE_RPC_COOKIE','DOODLETICK_DATA','DOODLETICK_LOCK_DIR','DOODLETICK_PORT')) { $oldSettings[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $cookie = Join-Path $chainPath 'regtest/.cookie'
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while (-not (Test-Path -LiteralPath $cookie)) {
    if ($process.HasExited -or [DateTime]::UtcNow -gt $deadline) { throw 'The test node did not start. Check its debug log inside the new test-data folder.' }
    Start-Sleep -Milliseconds 150
  }
  $address = & $client '-regtest' ('-datadir=' + $chainPath) '-rpcwait' 'getnewaddress' 'test-miner'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the test receiving address.' }
  Write-Host ('Test receiving address: ' + $address)
  Write-Host 'Open http://127.0.0.1:4317/scrypt.html and paste that address. Mining remains stopped until you press MINE NOW.'
  $env:DVC_CORE_NETWORK = 'regtest'
  $env:DVC_CORE_RPC_URL = 'http://127.0.0.1:18473'
  $env:DVC_CORE_RPC_COOKIE = $cookie
  $env:DOODLETICK_DATA = $keeperPath
  $env:DOODLETICK_LOCK_DIR = $keeperPath
  $env:DOODLETICK_PORT = '4317'
  & $nodeExe $keeper
} finally {
  foreach ($name in $oldSettings.Keys) { [Environment]::SetEnvironmentVariable($name, $oldSettings[$name], 'Process') }
  if (-not $process.HasExited) {
    & $client '-regtest' ('-datadir=' + $chainPath) 'stop' | Out-Null
    if (-not $process.WaitForExit(20000)) { Write-Warning 'The test node is still closing. Its data folder has been preserved.' }
  }
}
