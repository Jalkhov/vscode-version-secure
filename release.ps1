#!/bin/bash
# release.sh

if [ -z "$1" ]; then
    echo "Uso: ./release.sh 1.0.1"
    exit 1
fi

VERSION=$1

# Actualizar package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

# Commit y tag
git add package.json
git commit -m "Release v$VERSION"
git tag "v$VERSION"
git push origin main
git push origin "v$VERSION"

echo "✅ Release v$VERSION creado. Espera a GitHub Actions..."
echo "📥 Luego descarga el .vsix desde: https://github.com/jalkhov/vscode-version-secure/releases"
