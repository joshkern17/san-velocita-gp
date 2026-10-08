@echo off
rem San Velocita GP: starts the wheel force feedback helper, then the game
cd /d "%~dp0"
if exist "wheelffb\.ready" (
  start "San Velocita GP - Wheel Force Feedback" /min cmd /c "wheelffb\Start Wheel FFB.bat"
) else (
  start "San Velocita GP - Wheel Force Feedback" cmd /c "wheelffb\Start Wheel FFB.bat"
)
start "" "San Velocita GP.html"
