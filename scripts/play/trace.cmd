@echo off
REM Double-click this to start the local Play tracing server and open the tool.
REM No Python / VS Code needed — uses the portable Node already installed.
setlocal

set "NODE=%LOCALAPPDATA%\gf-node\node-v24.17.0-win-x64\node.exe"
if not exist "%NODE%" (
  REM fall back to a node on PATH if the pinned one moved
  where node >nul 2>nul && set "NODE=node"
)
if not exist "%NODE%" if not "%NODE%"=="node" (
  echo Could not find Node. Expected: %LOCALAPPDATA%\gf-node\node-v24.17.0-win-x64\node.exe
  pause
  exit /b 1
)

cd /d "%~dp0"
echo Starting the Play trace server...
start "" "http://localhost:8090/scripts/play/trace-tool.html"
"%NODE%" serve.mjs 8090

pause
