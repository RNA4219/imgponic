@echo off
setlocal
cd /d "%~dp0.."
where cargo >nul 2>nul || (echo Rust/Cargo not found. Install from https://rustup.rs & exit /b 1)
call npm i || exit /b 1
call npm run build || exit /b 1
call npx tauri build --bundles nsis || exit /b 1
set "BUNDLE_DIR=%CD%\target\release\bundle"
echo Build artifacts under: %BUNDLE_DIR%\
