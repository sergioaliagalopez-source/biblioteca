@echo off
rem Abre la Biblioteca: inicia un pequeño servidor local y abre el navegador.
rem Deja abierta la ventana minimizada mientras leas; al cerrarla se apaga el servidor.
cd /d "%~dp0"
start "Biblioteca (servidor)" /min py serve.py 8765
timeout /t 2 /nobreak >nul
start "" http://localhost:8765
