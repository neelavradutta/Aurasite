$mysqlBin = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe"
$dataDir = Join-Path $PSScriptRoot "..\data\mysql"

if (-not (Test-Path $mysqlBin)) {
  throw "MySQL not found. Run scripts/setup-mysql.ps1 first."
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (-not (Test-Path (Join-Path $dataDir "mysql"))) {
  Write-Host "Initializing MySQL data directory..."
  & (Join-Path (Split-Path $mysqlBin) "mysqld.exe") --initialize-insecure --datadir=$dataDir
}

Write-Host "Starting MySQL on port 3306 (data: $dataDir)..."
Start-Process -FilePath $mysqlBin -ArgumentList "--datadir=$dataDir", "--port=3306" -WindowStyle Hidden
