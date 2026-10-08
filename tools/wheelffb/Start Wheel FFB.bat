@echo off
title San Velocita GP - Wheel Force Feedback
cd /d "%~dp0"
set "PY="
set "LPY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
where py >nul 2>nul && set "PY=py"
if not defined PY if exist "%LPY%" set "PY=%LPY%"
if defined PY goto havepy
echo Installing Python. This only happens once and takes a minute or two...
winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
if exist "%LPY%" set "PY=%LPY%"
if defined PY goto havepy
echo.
echo Python could not be installed automatically.
echo Install it from https://www.python.org/downloads/ - tick "Add python.exe to PATH" - then try again.
pause
exit /b
:havepy
"%PY%" -c "import sdl2" >nul 2>nul
if errorlevel 1 (
  echo Getting the wheel library ready. This only happens once...
  "%PY%" -m pip install --quiet --disable-pip-version-check --user pysdl2 pysdl2-dll
)
echo ok> ".ready"
"%PY%" wheelffb.py
pause
