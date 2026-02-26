@echo off
chcp 65001 >nul
echo 📦 Generando .vsix...

:: Verificar vsce
where vsce >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Instalando vsce...
    call npm install -g @vscode/vsce
)

:: Verificar package.json
if not exist "package.json" (
    echo ❌ No se encontró package.json
    exit /b 1
)

:: Obtener versión
for /f "tokens=*" %%a in ('node -p "require('./package.json').version"') do set VERSION=%%a
echo 📋 Versión: %VERSION%

:: Generar
call vsce package --out "version-secure-%VERSION%.vsix"

if not exist "version-secure-%VERSION%.vsix" (
    echo ❌ Error al generar
    exit /b 1
)

echo ✅ Generado: version-secure-%VERSION%.vsix

:: Preguntar si instalar
set /p INSTALL=¿Instalar ahora? (s/n):
if /i "%INSTALL%"=="s" (
    echo 📥 Instalando...
    call code --install-extension "version-secure-%VERSION%.vsix" --force
    echo ✅ Instalado
)

echo.
echo 🎉 Listo!
pause
