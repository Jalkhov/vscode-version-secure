# Version Secure

Extensión personal para Visual Studio Code que permite verificar que las versiones definidas en múltiples archivos del proyecto sean iguales.

## ¿Qué hace?

- Lee los archivos configurados en `settings.json`
- Extrae la versión usando expresiones regulares
- Compara las versiones encontradas
- Muestra el estado en la Status Bar:
  - ✅ Coinciden
  - ⚠️ Faltan archivos o versiones
  - ❌ Versiones diferentes

## Configuración

Agregar en el `settings.json` del workspace:

```json
{
  "versionChecker.files": {
    "ruta/al/archivo.ext": {
      "patterns": [
        "regex_para_detectar_version"
      ]
    }
  }
}
```

### Ejemplo real

```json
{
  "versionChecker.files": {
    "test_files/test.py": {
      "patterns": [
        "APP_VERSION\\s*=\\s*[\"']([^\"']+)[\"']"
      ]
    },
    "test_files/test.nsi": {
      "patterns": [
        "!define\\s+APP_VERSION\\s*[\"']?([^\"']+)[\"']?"
      ]
    },
    "test_files/test.toml": {
      "patterns": [
        "^\\s*version\\s*=\\s*[\"']([^\"']+)[\"']"
      ]
    }
  }
}
```

## Reglas

* Se necesitan **mínimo 2 archivos** configurados para comparar versiones.
* Si un archivo no existe o no se puede parsear, se marcará como parcial.
* Si las versiones no coinciden, se mostrará un error en la Status Bar.

## Comportamiento

* Verificación automática al guardar (configurable).
* Verificación periódica por intervalo (configurable).
* Comando manual disponible desde la Command Palette.
* Click en la Status Bar para ver detalles y abrir archivos.
