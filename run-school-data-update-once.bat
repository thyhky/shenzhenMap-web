@echo off
setlocal
cd /d "%~dp0"
echo This will rebuild prepared school and school-zone data and upload only those records to production Cloudflare D1.
echo It does not collect official source data or deploy H5, Worker, or mini-program clients.
echo.
choice /M "Continue with the one-time production school data update"
if errorlevel 2 exit /b 1
call npm run update:schools -- --yes
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo School data update failed. Check logs\school-data-update.log.
) else (
  echo School and school-zone data were uploaded to production D1 and verified.
)
pause
exit /b %EXIT_CODE%
