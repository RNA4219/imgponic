@echo off
curl -s http://localhost:11434/api/tags >nul 2>nul
if %errorlevel% neq 0 (
  echo Ollama not reachable at http://localhost:11434
  echo Start Ollama and ensure a model is pulled, e.g.:  ollama run llama3:8b
  exit /b 1
) else (
  echo OK: Ollama appears reachable.
)
