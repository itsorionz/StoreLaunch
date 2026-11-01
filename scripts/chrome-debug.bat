@echo off
rem Starts (or reuses) a Chrome instance with remote debugging on port 9222
rem so the VS Code "frontend" profile can attach without opening a new window.
setlocal
set "PORT=9222"

rem If a debug Chrome is already running, just open a tab in it and exit.
curl -s -o nul "http://127.0.0.1:%PORT%/json/version" && (
  start "" "http://localhost:3000"
  exit /b 0
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not exist "%CHROME%" (
  echo Chrome/Edge not found. Start your browser with: --remote-debugging-port=%PORT%
  exit /b 1
)

start "" "%CHROME%" --remote-debugging-port=%PORT% --user-data-dir="%TEMP%\sl-chrome-debug" http://localhost:3000
