@echo off
setlocal
cd /d "%~dp0"
echo This will collect estate data, rebuild prepared school data, and update the production D1 database.
echo No H5 or mini-program client will be deployed.
echo.
choice /M "Continue with the production D1 update"
if errorlevel 2 exit /b 1
call npm run update:weekly -- --yes
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo Weekly update failed. Check logs\weekly-data-update.log.
) else (
  echo Weekly update completed and production verification passed.
)
pause
exit /b %EXIT_CODE%
