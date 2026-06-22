@echo off
REM Double-click to start the local Play trace server + open the tool.
REM No Python / VS Code needed - uses the portable Node already installed.
REM (The server is only needed for the magic-wand Detect button; you can also
REM  just open trace-tool.html directly in a browser for everything else.)
setlocal
cd /d "%~dp0"

REM --- find node.exe: any version under gf-node, else node on PATH ---
set "NODE="
for /d %%D in ("%LOCALAPPDATA%\gf-node\*") do if exist "%%D\node.exe" set "NODE=%%D\node.exe"
if not defined NODE for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "NODE=%%~$PATH:I"

if not defined NODE goto nonode
if not exist "serve.mjs" goto noserve

echo Found Node: %NODE%
echo Starting the trace server in a new window...
start "Play trace server - keep this open" "%NODE%" serve.mjs 8090
echo Waiting for it to come up...
timeout /t 2 /nobreak >nul
echo Opening the trace tool in your browser...
start "" "http://localhost:8090/scripts/play/trace-tool.html"
echo.
echo If the page says "can't be reached", wait a second and refresh.
echo Keep the "Play trace server" window open while you trace; close it when done.
echo.
goto end

:nonode
echo.
echo ERROR: could not find node.exe.
echo Looked under: %LOCALAPPDATA%\gf-node\   and your PATH.
echo You can still trace without the server: just open trace-tool.html in a browser.
echo.
goto end

:noserve
echo.
echo ERROR: serve.mjs is missing from this folder.
echo Pull the latest from GitHub so scripts\play\serve.mjs is present, or just
echo open trace-tool.html directly in a browser (no server needed to trace).
echo.

:end
pause
