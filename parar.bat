@echo off
REM ============================================================
REM  Pombo-Correio — Parar sistema
REM  Fecha as janelas do Backend e do Frontend abertas pelo
REM  iniciar.bat.
REM ============================================================

echo Fechando Pombo-Correio...

taskkill /FI "WINDOWTITLE eq Pombo-Correio - Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Pombo-Correio - Frontend*" /T /F >nul 2>&1

echo.
echo Sistema encerrado.
timeout /t 3
