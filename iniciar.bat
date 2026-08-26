@echo off
REM ============================================================
REM  Pombo-Correio — Iniciar sistema
REM  Abre o backend e o frontend em janelas separadas.
REM  Coloque este arquivo na pasta pombo-correio (mesmo nivel
REM  das pastas "backend" e "frontend").
REM ============================================================

echo Iniciando Pombo-Correio...
echo.

REM A worktree nao recebe o arquivo .env, pois ele contem credenciais e
REM fica fora do Git. Reutiliza o .env da pasta principal sem copiar senhas.
set "ENV_PRINCIPAL=C:\Users\Detona\Documents\AMBIENTE TESTE\backend\.env"

if not exist "%ENV_PRINCIPAL%" (
  echo ERRO: arquivo de configuracao nao encontrado:
  echo %ENV_PRINCIPAL%
  echo.
  pause
  exit /b 1
)

REM O backend herda esta variavel e carrega o .env indicado diretamente.
set "POMBO_ENV_FILE=%ENV_PRINCIPAL%"

REM Instala as dependencias antes de abrir as novas janelas. Assim, cada
REM janela recebe apenas um comando simples e nao encerra silenciosamente.
if not exist "%~dp0backend\node_modules" (
  echo Instalando dependencias do Backend...
  call npm --prefix "%~dp0backend" install
  if errorlevel 1 goto :erro_dependencias
)

if not exist "%~dp0frontend\node_modules" (
  echo Instalando dependencias do Frontend...
  call npm --prefix "%~dp0frontend" install
  if errorlevel 1 goto :erro_dependencias
)

start "Pombo-Correio - Backend (Worktree)" /D "%~dp0backend" cmd.exe /k npm start

REM Espera alguns segundos antes de abrir o frontend, para o backend
REM ja estar de pe quando o navegador tentar conversar com ele.
timeout /t 3 /nobreak >nul

REM Abre o frontend desta worktree numa janela propria
start "Pombo-Correio - Frontend (Worktree)" /D "%~dp0frontend" cmd.exe /k npm run dev

echo.
echo As duas janelas da worktree foram abertas (Backend e Frontend).
echo Aguarde alguns segundos e acesse o endereco mostrado na janela do Frontend.
echo.
echo Voce pode fechar esta janela.
timeout /t 1
exit /b 0

:erro_dependencias
echo.
echo ERRO: nao foi possivel instalar as dependencias da worktree.
pause
exit /b 1
