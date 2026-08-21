@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=py"
) else (
  set "PYTHON_CMD=python"
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating local Python environment...
  %PYTHON_CMD% -m venv .venv || goto :python_error
)

echo Installing required packages...
".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :install_error

echo Starting Shipowner Invoice Manager...
echo.
echo IMPORTANT: Keep this window open while using the program.
echo Your browser will open http://127.0.0.1:5000 automatically.
echo Press Ctrl+C in this window when you want to stop the program.
echo.
set "SHIPOWNER_OPEN_BROWSER=1"
".venv\Scripts\python.exe" app.py
goto :eof

:python_error
echo Python 3.10 or newer was not found. Install Python from https://www.python.org/downloads/
pause
exit /b 1

:install_error
echo Package installation failed. Check your internet connection and try again.
pause
exit /b 1
