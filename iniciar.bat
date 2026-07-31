@echo off
title Gestantes SIGIRES - Servidor Web
chcp 65001 >nul
cd /d "%~dp0"

set PYTHON_EXE=

where python >nul 2>nul
if %errorlevel% equ 0 (
    python -c "import sys; exit(0 if sys.version_info>=(3,8) else 1)" >nul 2>nul
    if %errorlevel% equ 0 set PYTHON_EXE=python
)

if "%PYTHON_EXE%"=="" (
    for %%V in (313 312 311 310 39 38) do (
        if exist "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe" (
            set PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe
            goto found
        )
    )
)

:found
if "%PYTHON_EXE%"=="" (
    echo [ERROR] Python no encontrado.
    pause & exit /b 1
)

echo [+] Iniciando servidor...
echo [+] Abre tu navegador en: http://localhost:5000
echo.
start "" http://localhost:5000
"%PYTHON_EXE%" app.py
pause
