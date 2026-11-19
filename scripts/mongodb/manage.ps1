[CmdletBinding()]
param([ValidateSet('Install', 'Start', 'Init', 'Status', 'Stop', 'Verify')][string]$Action = 'Status')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$version = '8.0.34'
$archiveName = "mongodb-windows-x86_64-$version.zip"
$expectedHash = '6b021a0864494e4decf278b36477a29eb36072432773e4e62c2f42c302630db0'
$toolsDirectory = Join-Path $projectRoot 'tools/mongodb'
$executable = Join-Path $toolsDirectory "mongodb-win32-x86_64-windows-$version/bin/mongod.exe"
$port = 27017
if ($env:HOSTELFIX_TEST_PORT) {
    if ($env:HOSTELFIX_TEST_PORT -notmatch '^\d+$' -or [int]$env:HOSTELFIX_TEST_PORT -lt 1024 -or [int]$env:HOSTELFIX_TEST_PORT -gt 65535) { throw 'Invalid HOSTELFIX_TEST_PORT.' }
    $port = [int]$env:HOSTELFIX_TEST_PORT
}
$localDirectory = if ($port -eq 27017) { '.local' } else { ".local/mongodb-test-$port" }
$dataDirectory = Join-Path $projectRoot "$localDirectory/mongodb-data"
$logDirectory = Join-Path $projectRoot "$localDirectory/mongodb-logs"
$runtimeDirectory = Join-Path $projectRoot "$localDirectory/mongodb-runtime"
$configPath = Join-Path $runtimeDirectory 'mongod.cfg'
$statePath = Join-Path $runtimeDirectory 'instance.json'
$helper = Join-Path $PSScriptRoot 'admin.js'

function Invoke-Admin([string]$Operation) {
    & node $helper $Operation
    if ($LASTEXITCODE -ne 0) { throw "MongoDB $Operation failed. Inspect .local/mongodb-logs/mongod.log. Data was retained." }
}

function Get-OwnedProcess {
    if (!(Test-Path -LiteralPath $statePath)) { return $null }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $instance = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if (!$instance) { return $null }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.pid)"
    if ($instance.Path -ne $executable -or $state.executable -ne $executable -or
        $state.projectRoot -ne $projectRoot -or $state.configPath -ne $configPath -or
        $instance.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.startTimeTicks -or
        $processInfo.CommandLine -notlike "*--config `"$configPath`"*") {
        throw 'Process ownership mismatch. Refusing to manage this PID. Inspect instance.json; do not replace it to claim another process.'
    }
    return $instance
}

function Assert-OwnedListener($Instance) {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object OwningProcess -eq $Instance.Id)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $listeners[0].LocalPort -ne $port) {
        throw 'Unexpected listening socket. Refusing to administer this instance.'
    }
}

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
try { $managementLock = [IO.File]::Open((Join-Path $runtimeDirectory 'management.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
catch { throw 'Another MongoDB management command is running. Retry after it finishes.' }

try {
    if ($Action -eq 'Install') {
        if ((Get-CimInstance Win32_Processor | Select-Object -First 1).Architecture -ne 9) {
            throw 'The pinned portable ZIP requires a Windows x86_64 machine.'
        }
        foreach ($dll in @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')) {
            if (!(Test-Path -LiteralPath (Join-Path $env:SystemRoot "System32/$dll"))) {
                throw "Missing Visual C++ x64 runtime dependency: $dll. No system component was installed."
            }
        }
        if (Test-Path -LiteralPath $executable) {
            & $executable --version
            if ($LASTEXITCODE -ne 0) { throw 'Existing mongod.exe could not execute. Inspect its runtime dependencies.' }
            Write-Output 'Existing project-local MongoDB installation retained.'
            return
        }
        $destination = Split-Path -Parent (Split-Path -Parent $executable)
        if (Test-Path -LiteralPath $destination) { throw 'Partial installation exists. Inspect it before retrying; no files were overwritten.' }
        New-Item -ItemType Directory -Path $toolsDirectory -Force | Out-Null
        $archive = Join-Path $toolsDirectory $archiveName
        $checksumPath = "$archive.sha256"
        $url = "https://fastdl.mongodb.org/windows/$archiveName"
        $ProgressPreference = 'SilentlyContinue'
        Write-Output "Downloading official checksum for MongoDB $version."
        Invoke-WebRequest -UseBasicParsing -Uri "$url.sha256" -OutFile $checksumPath -TimeoutSec 60
        $publishedHash = ((Get-Content -LiteralPath $checksumPath -Raw) -split '\s+')[0]
        if ($publishedHash -ne $expectedHash) { throw 'Official checksum differs from the pinned release. Installation stopped.' }
        if (!(Test-Path -LiteralPath $archive)) {
            Write-Output 'Downloading the official portable ZIP into tools/mongodb/.'
            Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive -TimeoutSec 600
        }
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) {
            throw 'Archive SHA-256 mismatch. It was not extracted; inspect the download before retrying.'
        }
        Write-Output 'Checksum verified. Extracting the portable ZIP.'
        Expand-Archive -LiteralPath $archive -DestinationPath $toolsDirectory
        if (!(Test-Path -LiteralPath $executable)) { throw 'Unexpected official ZIP layout. No server was started.' }
        & $executable --version
        if ($LASTEXITCODE -ne 0) { throw 'mongod.exe could not execute. Inspect the local runtime dependencies.' }
        Write-Output "Installed MongoDB $version under tools/mongodb/. No PATH or service changes."
        return
    }

    $instance = Get-OwnedProcess
    if ($Action -eq 'Start') {
        if ($instance) {
            Assert-OwnedListener $instance
            Invoke-Admin 'init'
            Write-Output 'Project MongoDB was already running; no second process started.'
            return
        }
        $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq $port)
        if ($listeners.Count) { throw "Port $port is occupied. Refusing to launch or stop an unowned instance. Inspect the listener first." }
        if (!(Test-Path -LiteralPath $executable)) { throw 'Run scripts/mongodb/install.ps1 first; project-local mongod.exe is missing.' }
        New-Item -ItemType Directory -Path $dataDirectory, $logDirectory -Force | Out-Null
        $config = @{
            storage = @{ dbPath = $dataDirectory; wiredTiger = @{ engineConfig = @{ cacheSizeGB = 0.25 } } }
            systemLog = @{ destination = 'file'; path = (Join-Path $logDirectory 'mongod.log'); logAppend = $true }
            net = @{ bindIp = '127.0.0.1'; port = $port }
            replication = @{ replSetName = 'rs0' }
        } | ConvertTo-Json -Depth 6
        [IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))
        $instance = Start-Process -FilePath $executable -ArgumentList @('--config', "`"$configPath`"", '--replSet', 'rs0') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'stdout.log') -RedirectStandardError (Join-Path $logDirectory 'stderr.log')
        $state = @{
            pid = $instance.Id; executable = $executable; projectRoot = $projectRoot; configPath = $configPath
            startTimeTicks = $instance.StartTime.ToUniversalTime().Ticks.ToString()
        } | ConvertTo-Json
        [IO.File]::WriteAllText($statePath, $state, [Text.UTF8Encoding]::new($false))
        $deadline = (Get-Date).AddSeconds(30)
        do {
            $instance.Refresh()
            if ($instance.HasExited) { throw "mongod.exe exited ($($instance.ExitCode)). Inspect .local/mongodb-logs/stderr.log and mongod.log; data retained." }
            $listener = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $port -and $_.OwningProcess -eq $instance.Id })
            if ($listener.Count) { break }
            if ((Get-Date) -gt $deadline) { throw 'MongoDB startup timed out. Ownership record retained; inspect status/logs before retrying.' }
            Start-Sleep -Milliseconds 300
        } while ($true)
        Assert-OwnedListener $instance
        Invoke-Admin 'init'
        return
    }
    if ($Action -eq 'Stop') {
        if (!$instance) { Write-Output 'Project MongoDB is already stopped; data retained.'; return }
        Assert-OwnedListener $instance
        Invoke-Admin 'stop'
        if (!$instance.WaitForExit(30000)) { throw 'Graceful shutdown timed out; no process was force-killed. Inspect logs.' }
        Write-Output 'Project MongoDB stopped; database files retained.'
        return
    }
    if (!$instance) { throw 'Project MongoDB is not running. Run scripts/mongodb/start.ps1.' }
    Assert-OwnedListener $instance
    Invoke-Admin $Action.ToLowerInvariant()
} finally {
    $managementLock.Dispose()
}
