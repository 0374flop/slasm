@echo off
if "%~1"=="" (
    echo No file specified. Drag a .slasm or .slpkg file onto this bat.
    pause
    exit /b 1
)
cmd /k slasm run "%~1"