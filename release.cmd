@echo off
chcp 65001 >nul

:: Pedir versión
set /p VERSION=Versión para release (ej: 1.0.0):
if "%VERSION%"=="" (
    echo ❌ Debes especificar una versión
    exit /b 1
)

echo 🚀 Creando release v%VERSION%...

:: Actualizar package.json
node -e "const p=require('./package.json');p.version='%VERSION%';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"

echo ✅ package.json actualizado

:: Git
git add package.json
git commit -m "Release v%VERSION%"
git tag "v%VERSION%"
git push origin main
git push origin "v%VERSION%"

echo.
echo 🎉 ¡Release v%VERSION% creado!
echo ⏳ Espera a GitHub Actions...
echo 📥 https://github.com/jalkhov/vscode-version-secure/releases

pause
