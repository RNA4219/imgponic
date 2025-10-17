@echo off
setlocal
cd /d "%~dp0.."
set BUNDLE_DIR=src-tauri\target\release\bundle
for /f "delims=" %%A in ('dir /s /b "%BUNDLE_DIR%\**\*.exe" ^| findstr /i /c:"PromptForge"') do (
  set EXE=%%A
  goto :run
)
echo Built exe not found. Run scripts\build.bat first.
exit /b 1
:run
echo Launching: %EXE%
start "" "%EXE%"
