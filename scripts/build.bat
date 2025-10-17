@echo off
setlocal
cd /d "%~dp0.."
where cargo >nul 2>nul || (echo Rust/Cargo not found. Install from https://rustup.rs & exit /b 1)
call npm i || exit /b 1
call npm run build || exit /b 1
call npx tauri build --bundles nsis || exit /b 1
echo Build artifacts under: src-tauri\target\release\bundle\
