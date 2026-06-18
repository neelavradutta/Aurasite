# Installs MySQL 8 and initializes the ANPR database on Windows.
param(
  [string]$RootPassword = "rootpassword",
  [string]$DbName = "anpr_db",
  [string]$DbUser = "anpr_user",
  [string]$DbPass = "anpr_pass"
)

$ErrorActionPreference = "Stop"

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host "==> Checking MySQL..."
if (-not (Test-Command mysql)) {
  Write-Host "==> Installing MySQL (Oracle.MySQL via winget)..."
  winget install Oracle.MySQL --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

$mysqlExe = (Get-Command mysql -ErrorAction SilentlyContinue)?.Source
if (-not $mysqlExe) {
  $candidates = @(
    "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { $mysqlExe = $path; break }
  }
}

if (-not $mysqlExe) {
  throw "MySQL client not found after install. Re-open terminal and run this script again."
}

Write-Host "==> Using MySQL at $mysqlExe"

$sql = @"
CREATE DATABASE IF NOT EXISTS $DbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DbUser'@'localhost' IDENTIFIED BY '$DbPass';
CREATE USER IF NOT EXISTS '$DbUser'@'%' IDENTIFIED BY '$DbPass';
GRANT ALL PRIVILEGES ON ${DbName}.* TO '$DbUser'@'localhost';
GRANT ALL PRIVILEGES ON ${DbName}.* TO '$DbUser'@'%';
FLUSH PRIVILEGES;
"@

Write-Host "==> Creating database and user..."
& $mysqlExe -u root -p"$RootPassword" -e $sql

$backendEnv = Join-Path $PSScriptRoot "..\backend\.env"
if (Test-Path $backendEnv) {
  $content = Get-Content $backendEnv -Raw
  $content = $content -replace 'DATABASE_URL=.*', "DATABASE_URL=mysql://${DbUser}:${DbPass}@localhost:3306/${DbName}"
  if ($content -notmatch 'MYSQL_ROOT_PASSWORD=') {
    $content += "`nMYSQL_ROOT_USER=root`nMYSQL_ROOT_PASSWORD=$RootPassword"
  }
  Set-Content -Path $backendEnv -Value $content.TrimEnd() -NoNewline
  Add-Content -Path $backendEnv -Value ""
}

Write-Host "==> Running Sequelize setup..."
Push-Location (Join-Path $PSScriptRoot "..\backend")
npm.cmd run db:setup
Pop-Location

Write-Host ""
Write-Host "MySQL database ready: $DbName"
Write-Host "Connection: mysql://${DbUser}:${DbPass}@localhost:3306/${DbName}"
