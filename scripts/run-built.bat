@echo off
setlocal
cd /d "%~dp0.."
if defined IMGPO_BUNDLE_DIR (
  set "BUNDLE_DIR=%IMGPO_BUNDLE_DIR%"
) else (
  set "BUNDLE_DIR=%CD%\target\release\bundle"
)
for /f "delims=" %%A in ('dir /s /b "%BUNDLE_DIR%\*.exe" ^| findstr /i /c:"PromptForge"') do (
  set EXE=%%A
  goto :run
)
echo Built exe not found. Run scripts\build.bat first.
exit /b 1
:run
echo Launching: %EXE%
start "" "%EXE%"
