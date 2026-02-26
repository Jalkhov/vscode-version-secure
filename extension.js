const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

// Estado global
let statusBarItem;
let outputChannel;
let currentVersions = {};
let config = {};

function activate(context) {
  // Canal de output para debugging
  outputChannel = vscode.window.createOutputChannel("Version Checker");

  // Crear item en status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    getConfig("statusBarPriority", 1000),
  );
  statusBarItem.command = "versionChecker.showDetails";
  context.subscriptions.push(statusBarItem);

  // Cargar configuración inicial
  loadConfiguration();

  // Escuchar cambios en configuración
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("versionChecker")) {
        loadConfiguration();
        checkVersions();
      }
    }),
  );

  // Escuchar guardado de archivos
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (getConfig("checkOnSave", true)) {
        const filename = path.basename(doc.fileName);
        if (config.files && config.files[filename]) {
          checkVersions();
        }
      }
    }),
  );

  // Comandos
  context.subscriptions.push(
    vscode.commands.registerCommand("versionChecker.check", checkVersions),
    vscode.commands.registerCommand("versionChecker.showDetails", showDetails),
  );

  // Verificación inicial
  checkVersions();

  // Intervalo de actualización automática
  const interval = getConfig("checkInterval", 10000);
  if (interval > 0) {
    setInterval(checkVersions, interval);
  }

  outputChannel.appendLine("Version Checker activado");
}

function loadConfiguration() {
  const workspaceConfig = vscode.workspace.getConfiguration("versionChecker");
  config = {
    files: workspaceConfig.get("files", {
      "config.py": {
        patterns: ["APP_VERSION\\s*=\\s*[\"']([^\"']+)[\"']"],
      },
      "installer.nsi": {
        patterns: [
          "!define\\s+APP_VERSION\\s*[\"']?([^\"']+)[\"']?",
          "!define\\s+VERSION\\s*[\"']?([^\"']+)[\"']?",
        ],
      },
      "pyproject.toml": {
        patterns: ["^version\\s*=\\s*[\"']([^\"']+)[\"']"],
      },
    }),
    checkOnSave: workspaceConfig.get("checkOnSave", true),
    checkInterval: workspaceConfig.get("checkInterval", 10000),
    statusBarPriority: workspaceConfig.get("statusBarPriority", 1000),
  };
}

function getConfig(key, defaultValue) {
  return vscode.workspace
    .getConfiguration("versionChecker")
    .get(key, defaultValue);
}

function extractVersion(content, patterns) {
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, "i");
      const match = content.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch (e) {
      outputChannel.appendLine(`Error en patrón "${pattern}": ${e.message}`);
    }
  }
  return null;
}

function getVersions() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return {};
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const versions = {};

  for (const [filename, fileConfig] of Object.entries(config.files)) {
    const filePath = path.join(rootPath, filename);

    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        const version = extractVersion(
          content,
          fileConfig.patterns || fileConfig,
        );
        versions[filename] = {
          version: version,
          path: filePath,
          found: version !== null,
        };
      } else {
        versions[filename] = {
          version: null,
          path: filePath,
          found: false,
          error: "Archivo no encontrado",
        };
      }
    } catch (error) {
      versions[filename] = {
        version: null,
        path: filePath,
        found: false,
        error: error.message,
      };
    }
  }

  return versions;
}

function checkVersions() {
  currentVersions = getVersions();

  const foundVersions = Object.entries(currentVersions)
    .filter(([_, data]) => data.found && data.version)
    .map(([_, data]) => data.version);

  const allFiles = Object.keys(config.files);
  const foundFiles = Object.entries(currentVersions)
    .filter(([_, data]) => data.found)
    .map(([name, _]) => name);

  const notFound = allFiles.filter((f) => !foundFiles.includes(f));

  // Determinar estado
  let status = "ok"; // ok, mismatch, missing, error
  let tooltip = "";
  let text = "";

  if (foundVersions.length === 0) {
    status = "error";
    text = "$(error) No versions";
    tooltip = "No se encontraron archivos de versión";
  } else if (notFound.length > 0) {
    status = "missing";
    text = `$(warning) v${foundVersions[0]}`;
    tooltip = `Faltan: ${notFound.join(", ")}`;
  } else {
    const unique = [...new Set(foundVersions)];
    if (unique.length === 1) {
      status = "ok";
      text = `$(check) v${unique[0]}`;
      tooltip = `✅ Todas las versiones coinciden: ${unique[0]}`;
    } else {
      status = "mismatch";
      text = `$(error) v${foundVersions[0]} ⚠️`;
      tooltip = formatMismatchTooltip(currentVersions);
    }
  }

  // Actualizar UI
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;

  // Colores según estado
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
  } else if (status === "missing") {
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

  statusBarItem.show();

  // Log
  outputChannel.appendLine(
    `[${new Date().toLocaleTimeString()}] Check: ${status} - ${text}`,
  );

  return { status, versions: currentVersions };
}

function formatMismatchTooltip(versions) {
  const lines = ["❌ INCONGRUENCIA DE VERSIONES", ""];

  // Agrupar por versión
  const byVersion = {};
  for (const [file, data] of Object.entries(versions)) {
    const ver = data.version || "NO DETECTADA";
    byVersion[ver] = byVersion[ver] || [];
    byVersion[ver].push(file);
  }

  for (const [ver, files] of Object.entries(byVersion)) {
    lines.push(`${ver}:`);
    files.forEach((f) => lines.push(`  • ${f}`));
    lines.push("");
  }

  return lines.join("\n");
}

async function showDetails() {
  const { status, versions } = checkVersions();

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

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Archivos de versión detectados",
    title: "Version Checker - Detalles",
  });

  if (selected && selected.found) {
    const doc = await vscode.workspace.openTextDocument(selected.detail);
    await vscode.window.showTextDocument(doc);
  }
}

function deactivate() {
  outputChannel?.dispose();
  statusBarItem?.dispose();
}

module.exports = { activate, deactivate };
