@echo off
setlocal
cd /d "%~dp0"
echo This will collect estate prices and upload only estate, street, and price-history data to production Cloudflare D1.
echo It does not update school data or deploy H5, Worker, or mini-program clients.
echo.
choice /M "Continue with the one-time production estate price update"
if errorlevel 2 exit /b 1
call npm run update:estate-prices -- --yes
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo Estate price update failed. Check logs\estate-price-update.log.
) else (
  echo Estate prices were uploaded to production D1 and verified.
)
pause
exit /b %EXIT_CODE%
