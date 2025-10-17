@echo off
setlocal
cd /d "%~dp0.."
call npm i || goto :error
where cargo >nul 2>nul || (echo Rust/Cargo not found. Install from https://rustup.rs & goto :error)
call npx tauri dev
goto :eof
:error
echo Dev startup failed.
exit /b 1
