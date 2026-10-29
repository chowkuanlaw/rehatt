@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  call npm.cmd ci
  if errorlevel 1 (
    echo Installeren is mislukt. Bekijk de foutmelding hierboven.
    pause
    exit /b 1
  )
)
call npm.cmd start
pause
