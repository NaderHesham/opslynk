@echo off
setlocal

title OpsLynk Builder
color 0A
echo.
echo  ================================================
echo      OpsLynk Build Script
echo      LAN Chat Packaging Helper
echo  ================================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found.
    echo  Install Node.js v18 or later on the build machine.
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js detected:
node --version

echo.
echo  [1/4] Installing dependencies...
call npm.cmd install --legacy-peer-deps
if errorlevel 1 (
    echo  [ERROR] npm install failed.
    pause
    exit /b 1
)
echo  [OK] Dependencies installed.

echo.
echo  [2/4] Building NSIS installer and portable app...
call npm.cmd run build
if errorlevel 1 (
    echo  [ERROR] Standard build failed.
    pause
    exit /b 1
)
echo  [OK] Standard build complete.

echo.
echo  [3/4] Building MSI package for GPO deployment...
call npm.cmd run build-msi
if errorlevel 1 (
    echo  [WARN] MSI build did not complete.
    echo  [WARN] The build machine may need Administrator rights or Windows Developer Mode.
) else (
    echo  [OK] MSI build complete.
)

echo.
echo  [4/4] Done.
echo.
echo  Output files are generated in dist\
echo  - OpsLynk Setup.exe : manual installer
echo  - OpsLynk.exe       : portable app
echo  - OpsLynk*.msi      : domain deployment package
echo.
echo  Deployment notes:
echo  - Use the MSI for Group Policy Software Installation
echo  - Publish firewall rules by GPO for UDP 45678
echo  - Publish firewall rules by GPO for TCP 45679-45700
echo.
pause
