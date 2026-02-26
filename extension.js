const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

// Estado global
let statusBarItem;
let outputChannel;
let currentVersions = {};
let config = {};

function activate(context) {
  // Crear canal de output para logs detallados
  outputChannel = vscode.window.createOutputChannel("Version Checker Debug");
  outputChannel.show(true); // Mostrar inmediatamente al activar

  log("🚀 Version Checker - Activando extensión...");
  log(`📁 Contexto: ${context.extensionPath}`);

  // Crear item en status bar
  const priority = getConfig("statusBarPriority", 1000);
  log(`⚙️ Priority configurada: ${priority}`);

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    priority,
  );
  statusBarItem.command = "versionChecker.showDetails";
  context.subscriptions.push(statusBarItem);
  log("✅ StatusBarItem creado");

  // Cargar configuración inicial
  log("📋 Cargando configuración...");
  loadConfiguration();
  log(`📊 Configuración cargada: ${JSON.stringify(config, null, 2)}`);

  // Escuchar cambios en configuración
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      log("🔄 Configuración cambiada detectada");
      if (e.affectsConfiguration("versionChecker")) {
        log("✏️ Afecta versionChecker, recargando...");
        loadConfiguration();
        checkVersions();
      }
    }),
  );

  // Escuchar guardado de archivos
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      log(`💾 Archivo guardado: ${doc.fileName}`);
      if (getConfig("checkOnSave", true)) {
        const filename = path.basename(doc.fileName);
        log(`🔍 Verificando si ${filename} está en config...`);
        if (config.files && config.files[filename]) {
          log(`✅ ${filename} está configurado, ejecutando check...`);
          checkVersions();
        } else {
          log(`⏭️ ${filename} no está en config.files`);
        }
      }
    }),
  );

  // Comandos
  context.subscriptions.push(
    vscode.commands.registerCommand("versionChecker.check", () => {
      log("🎯 Comando 'check' ejecutado manualmente");
      checkVersions();
    }),
    vscode.commands.registerCommand("versionChecker.showDetails", () => {
      log("🎯 Comando 'showDetails' ejecutado");
      showDetails();
    }),
  );

  // Verificación inicial
  log("🔎 Ejecutando verificación inicial...");
  const result = checkVersions();
  log(`📊 Resultado inicial: ${JSON.stringify(result, null, 2)}`);

  // Intervalo de actualización automática
  const interval = getConfig("checkInterval", 10000);
  log(`⏱️ Intervalo configurado: ${interval}ms`);
  if (interval > 0) {
    setInterval(() => {
      log("⏰ Check por intervalo automático");
      checkVersions();
    }, interval);
  }

  log("✨ Version Checker activado completamente");
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}

function loadConfiguration() {
  log("⚙️ loadConfiguration() iniciando...");
  const workspaceConfig = vscode.workspace.getConfiguration("versionChecker");

  const userFiles = workspaceConfig.get("files", null);
  log(`📂 userFiles obtenido: ${userFiles ? "SÍ" : "NO"}`);
  if (userFiles) {
    log(`📊 Cantidad de archivos: ${Object.keys(userFiles).length}`);
    log(`📄 Archivos: ${JSON.stringify(Object.keys(userFiles))}`);
  }

  if (!userFiles || Object.keys(userFiles).length === 0) {
    log("⚠️ NO HAY ARCHIVOS CONFIGURADOS");
    config = {
      files: {},
      checkOnSave: workspaceConfig.get("checkOnSave", true),
      checkInterval: workspaceConfig.get("checkInterval", 10000),
      statusBarPriority: workspaceConfig.get("statusBarPriority", 1000),
      _configured: false,
    };
  } else {
    log("✅ Archivos configurados encontrados");
    config = {
      files: userFiles,
      checkOnSave: workspaceConfig.get("checkOnSave", true),
      checkInterval: workspaceConfig.get("checkInterval", 10000),
      statusBarPriority: workspaceConfig.get("statusBarPriority", 1000),
      _configured: true,
    };
  }
  log(
    `📋 Config final: _configured=${config._configured}, files=${Object.keys(config.files).length}`,
  );
}

function getConfig(key, defaultValue) {
  const val = vscode.workspace
    .getConfiguration("versionChecker")
    .get(key, defaultValue);
  log(`🔧 getConfig(${key}) = ${val}`);
  return val;
}

function extractVersion(content, patterns) {
  log(`🔍 extractVersion() con ${patterns.length} patrones`);
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    try {
      log(`  📐 Probando patrón ${i + 1}: ${pattern.substring(0, 50)}...`);
      const regex = new RegExp(pattern, "im");
      const match = content.match(regex);
      if (match && match[1]) {
        const version = match[1].trim();
        log(`  ✅ Encontrado: "${version}"`);
        return version;
      } else {
        log(`  ❌ No match`);
      }
    } catch (e) {
      log(`  💥 Error en patrón: ${e.message}`);
    }
  }
  log(`  ⚠️ Ningún patrón funcionó`);
  return null;
}

function getVersions() {
  log("📂 getVersions() iniciando...");
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    log("❌ NO HAY WORKSPACE ABIERTO");
    return {};
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  log(`📁 Workspace root: ${rootPath}`);

  // Si no hay archivos configurados, retornar vacío
  if (!config.files || Object.keys(config.files).length === 0) {
    log("⚠️ No hay archivos en config.files");
    return {};
  }

  const versions = {};
  const fileEntries = Object.entries(config.files);
  log(`🔍 Procesando ${fileEntries.length} archivos...`);

  for (const [filename, fileConfig] of fileEntries) {
    const filePath = path.join(rootPath, filename);
    log(`  📄 ${filename}:`);
    log(`     Ruta: ${filePath}`);

    try {
      if (fs.existsSync(filePath)) {
        log(`     ✅ Archivo existe`);
        const content = fs.readFileSync(filePath, "utf8");
        log(`     📖 Leído: ${content.length} caracteres`);

        const patterns = fileConfig.patterns || fileConfig;
        log(
          `     🔍 Patrones: ${Array.isArray(patterns) ? patterns.length : "no array"}`,
        );

        const version = extractVersion(
          content,
          Array.isArray(patterns) ? patterns : [patterns],
        );

        versions[filename] = {
          version: version,
          path: filePath,
          found: version !== null,
        };
        log(`     📊 Resultado: ${version ? "v" + version : "NO ENCONTRADO"}`);
      } else {
        log(`     ❌ Archivo NO existe`);
        versions[filename] = {
          version: null,
          path: filePath,
          found: false,
          error: "Archivo no encontrado",
        };
      }
    } catch (error) {
      log(`     💥 Error: ${error.message}`);
      versions[filename] = {
        version: null,
        path: filePath,
        found: false,
        error: error.message,
      };
    }
  }

  log(`📊 getVersions() retorna ${Object.keys(versions).length} entradas`);
  return versions;
}

function checkVersions() {
  log("🔎 checkVersions() ========== INICIO ==========");

  // Validar configuración
  if (!config._configured) {
    log("⚠️ NO CONFIGURADO - Mostrando mensaje de config");
    statusBarItem.text = "$(gear) Configurar Version Checker";
    statusBarItem.tooltip =
      'Haz clic para abrir configuración\n\nAñade en settings.json:\n"versionChecker.files": {\n  "tu-archivo.ext": {\n    "patterns": ["regex-aqui"]\n  }\n}';
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.warningForeground",
    );
    statusBarItem.show();
    log("✅ StatusBar actualizado (no configurado)");

    return { status: "noconfig", versions: {} };
  }

  currentVersions = getVersions();
  const allFiles = Object.keys(config.files);
  log(`📊 Total archivos configurados: ${allFiles.length}`);
  log(`📄 Lista: ${allFiles.join(", ")}`);

  // Validar que haya al menos 2 archivos configurados
  if (allFiles.length < 2) {
    log(`⚠️ SOLO ${allFiles.length} ARCHIVO(S) - Se necesitan 2`);
    statusBarItem.text = "$(warning) Mínimo 2 archivos requeridos";
    statusBarItem.tooltip = `Tienes ${allFiles.length} archivo(s) configurado.\n\nSe necesitan al menos 2 archivos para comparar versiones.\n\nArchivo actual: ${allFiles.join(", ") || "ninguno"}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.warningForeground",
    );
    statusBarItem.show();
    log("✅ StatusBar actualizado (pocos archivos)");

    return { status: "toofew", versions: currentVersions };
  }

  const foundVersions = Object.entries(currentVersions)
    .filter(([_, data]) => data.found && data.version)
    .map(([_, data]) => data.version);
  log(
    `✅ Versiones encontradas: ${foundVersions.length} - [${foundVersions.join(", ")}]`,
  );

  const foundFiles = Object.entries(currentVersions)
    .filter(([_, data]) => data.found)
    .map(([name, _]) => name);
  log(
    `📄 Archivos encontrados: ${foundFiles.length} - [${foundFiles.join(", ")}]`,
  );

  const notFound = allFiles.filter((f) => !foundFiles.includes(f));
  log(
    `❌ Archivos NO encontrados: ${notFound.length} - [${notFound.join(", ")}]`,
  );

  // Determinar estado
  let status = "ok";
  let tooltip = "";
  let text = "";

  if (foundVersions.length === 0) {
    log("❌ ESTADO: error (0 versiones)");
    status = "error";
    text = "$(error) No versions found";
    tooltip = "Ningún archivo de versión fue encontrado o parseado";
  } else if (notFound.length > 0) {
    log("⚠️ ESTADO: partial (faltan archivos)");
    status = "partial";
    text = `$(warning) v${foundVersions[0]} (${foundFiles.length}/${allFiles.length})`;
    tooltip = `Faltan archivos: ${notFound.join(", ")}\n\nDetectados:\n${foundFiles.map((f) => `  ✓ ${f}`).join("\n")}\n\nFaltan:\n${notFound.map((f) => `  ✗ ${f}`).join("\n")}`;
  } else {
    log("✅ Todos los archivos encontrados, verificando coincidencia...");
    const unique = [...new Set(foundVersions)];
    log(`🔍 Versiones únicas: ${unique.length} - [${unique.join(", ")}]`);

    if (unique.length === 1) {
      log("✅ ESTADO: ok (todas coinciden)");
      status = "ok";
      text = `$(check) v${unique[0]}`;
      tooltip = `✅ Todas las versiones coinciden: ${unique[0]}\n\nArchivos:\n${foundFiles.map((f) => `  • ${f}`).join("\n")}`;
    } else {
      log("❌ ESTADO: mismatch (versiones diferentes)");
      status = "mismatch";
      text = `$(error) v${foundVersions[0]} ⚠️${unique.length - 1}`;
      tooltip = formatMismatchTooltip(currentVersions);
    }
  }

  // Actualizar UI
  log(`🎨 Actualizando StatusBar: "${text}"`);
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;

  // Colores según estado
  log(`🎨 Aplicando colores para estado: ${status}`);
  if (status === "ok") {
    statusBarItem.backgroundColor = undefined;
    statusBarItem.color = undefined;
  } else if (status === "mismatch") {
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.errorForeground",
    );
  } else if (status === "partial") {
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.color = new vscode.ThemeColor(
      "statusBarItem.warningForeground",
    );
  } else {
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
  }

  log("👁️ Mostrando StatusBarItem...");
  statusBarItem.show();
  log("✅ StatusBarItem.show() ejecutado");

  log(`📊 ========== FIN checkVersions() - Estado: ${status} ==========`);
  return { status, versions: currentVersions };
}

function formatMismatchTooltip(versions) {
  const lines = ["❌ INCONGRUENCIA DE VERSIONES", ""];

  const byVersion = {};
  for (const [file, data] of Object.entries(versions)) {
    const ver = data.version || "NO DETECTADA";
    byVersion[ver] = byVersion[ver] || [];
    byVersion[ver].push(file);
  }

  for (const [ver, files] of Object.entries(byVersion)) {
    const icon = ver === "NO DETECTADA" ? "✗" : "●";
    lines.push(`${icon} ${ver}:`);
    files.forEach((f) => lines.push(`    ${f}`));
    lines.push("");
  }

  return lines.join("\n");
}

async function showDetails() {
  log("🖱️ showDetails() llamado");

  if (!config._configured) {
    log("⚠️ Mostrando ayuda de configuración");
    const result = await vscode.window.showInformationMessage(
      "Version Checker no está configurado",
      {
        modal: false,
        detail: "Añade 'versionChecker.files' en tu settings.json",
      },
      "Abrir Settings",
      "Ver Ejemplo",
    );

    if (result === "Abrir Settings") {
      vscode.commands.executeCommand("workbench.action.openSettingsJson");
    }
    return;
  }

  const { status, versions } = checkVersions();
  log(`📊 Mostrando detalles - estado: ${status}`);

  const items = Object.entries(versions).map(([filename, data]) => {
    const version = data.version || "No detectada";
    const icon = data.found ? "$(check)" : "$(error)";
    const description = data.found
      ? `v${version}`
      : data.error || "No encontrado";

    return {
      label: `${icon} ${filename}`,
      description: description,
      detail: data.path,
      version: version,
      found: data.found,
    };
  });

  const allFiles = Object.keys(config.files);
  if (allFiles.length < 2) {
    items.unshift({
      label: "$(warning) Configuración incompleta",
      description: `Se necesitan ≥2 archivos (tienes ${allFiles.length})`,
      detail: "Añade más archivos en versionChecker.files",
      found: false,
      version: null,
    });
  }

  log(`📋 Mostrando QuickPick con ${items.length} items`);
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Archivos de versión detectados",
    title: "Version Checker - Detalles",
  });

  if (selected?.found && selected?.detail) {
    log(`📖 Abriendo archivo: ${selected.detail}`);
    const doc = await vscode.workspace.openTextDocument(selected.detail);
    await vscode.window.showTextDocument(doc);
  } else {
    log(`⏭️ Nada seleccionado o no se puede abrir`);
  }
}

function deactivate() {
  log("👋 Version Checker - Desactivando");
  outputChannel?.dispose();
  statusBarItem?.dispose();
}

module.exports = { activate, deactivate };
