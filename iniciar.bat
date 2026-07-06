@echo off
REM ============================================================
REM  Pombo-Correio — Iniciar sistema
REM  Abre o backend e o frontend em janelas separadas.
REM  Coloque este arquivo na pasta pombo-correio (mesmo nivel
REM  das pastas "backend" e "frontend").
REM ============================================================

echo Iniciando Pombo-Correio...
echo.

REM Abre o backend numa janela propria
start "Pombo-Correio - Backend" cmd /k "cd /d %~dp0backend && npm start"

REM Espera alguns segundos antes de abrir o frontend, para o backend
REM ja estar de pe quando o navegador tentar conversar com ele.
timeout /t 3 /nobreak >nul

REM Abre o frontend numa janela propria
start "Pombo-Correio - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo As duas janelas foram abertas (Backend e Frontend).
echo Aguarde alguns segundos e acesse o endereco mostrado na janela do Frontend.
echo.
echo Voce pode fechar esta janela.
timeout /t 5
