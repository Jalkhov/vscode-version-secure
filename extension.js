const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

let statusBarItem;
let outputChannel;
let config = {};
let isActive = false;

const LOG_PREFIX = "[Version Checker]";

function log(level, message) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const line = `${timestamp} ${level} ${message}`;
  outputChannel?.appendLine(line);
  if (level === "ERR") console.error(`${LOG_PREFIX} ${message}`);
}

function activate(context) {
  outputChannel = vscode.window.createOutputChannel("Version Checker");

  // Verificar si está habilitado para este workspace
  const enabled = vscode.workspace
    .getConfiguration("versionChecker")
    .get("enabled", null);

  if (enabled === false) {
    log("INF", "Deshabilitado para este workspace");
    return;
  }

  isActive = true;
  log("INF", "Activando...");

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    getConfig("statusBarPriority", 1000),
  );
  statusBarItem.command = "versionChecker.showDetails";
  context.subscriptions.push(statusBarItem);

  loadConfig();
  updateStatus();

  // Eventos
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("versionChecker")) return;
      const newEnabled = vscode.workspace
        .getConfiguration("versionChecker")
        .get("enabled", null);
      if (newEnabled === false) {
        isActive = false;
        statusBarItem?.hide();
        log("INF", "Deshabilitado por cambio de configuración");
        return;
      }
      isActive = true;
      loadConfig();
      updateStatus();
    }),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!isActive || !config.checkOnSave) return;
      const filename = path.basename(doc.fileName);
      if (config.files?.[filename]) updateStatus();
    }),
  );

  // Comandos
  context.subscriptions.push(
    vscode.commands.registerCommand("versionChecker.check", updateStatus),
    vscode.commands.registerCommand("versionChecker.showDetails", showDetails),
    vscode.commands.registerCommand("versionChecker.toggle", toggleExtension),
  );

  log("INF", "Listo");
}

function getConfig(key, defaultValue) {
  return vscode.workspace
    .getConfiguration("versionChecker")
    .get(key, defaultValue);
}

function loadConfig() {
  const files = getConfig("files", {});
  const fileCount = Object.keys(files).length;

  config = {
    files,
    checkOnSave: getConfig("checkOnSave", true),
    checkInterval: getConfig("checkInterval", 0),
    statusBarPriority: getConfig("statusBarPriority", 1000),
    _configured: fileCount > 0,
    _fileCount: fileCount,
  };

  log("DBG", `${fileCount} archivo(s) configurado(s)`);
}

function extractVersion(content, patterns) {
  for (const pattern of patterns) {
    try {
      const match = content.match(new RegExp(pattern, "im"));
      if (match?.[1]) return match[1].trim();
    } catch (e) {
      log("ERR", `Patrón inválido: ${pattern}`);
    }
  }
  return null;
}

function getVersions() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;

  const root = folders[0].uri.fsPath;
  const result = {};

  for (const [filename, cfg] of Object.entries(config.files)) {
    const filepath = path.join(root, filename);
    try {
      if (!fs.existsSync(filepath)) {
        result[filename] = { found: false, error: "No existe" };
        continue;
      }
      const content = fs.readFileSync(filepath, "utf8");
      const patterns = cfg.patterns || [cfg];
      const version = extractVersion(content, patterns);
      result[filename] = {
        version,
        found: version !== null,
        path: filepath,
      };
    } catch (err) {
      result[filename] = { found: false, error: err.message };
    }
  }

  return result;
}

function updateStatus() {
  if (!isActive) return;

  if (!config._configured) {
    statusBarItem.text = "$(gear) Version Checker";
    statusBarItem.tooltip = "Click para configurar";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.show();
    return;
  }

  if (config._fileCount < 2) {
    statusBarItem.text = "$(warning) Mínimo 2 archivos";
    statusBarItem.tooltip = `Configurados: ${config._fileCount}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBarItem.show();
    return;
  }

  const versions = getVersions();
  if (!versions) {
    statusBarItem.hide();
    return;
  }

  const entries = Object.entries(versions);
  const found = entries.filter(([, d]) => d.found && d.version);
  const foundVersions = found.map(([, d]) => d.version);
  const foundFiles = found.map(([n]) => n);
  const missing = entries.filter(([, d]) => !d.found).map(([n]) => n);

  if (foundVersions.length === 0) {
    statusBarItem.text = "$(error) Sin versiones";
    statusBarItem.tooltip = "Ningún archivo parseado correctamente";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
    statusBarItem.show();
    log("WRN", "Ninguna versión detectada");
    return;
  }

  const unique = [...new Set(foundVersions)];

  if (missing.length > 0) {
    statusBarItem.text = `$(warning) v${foundVersions[0]} (${found.length}/${entries.length})`;
    statusBarItem.tooltip = `Falta: ${missing.join(", ")}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
  } else if (unique.length === 1) {
    statusBarItem.text = `$(check) v${unique[0]}`;
    statusBarItem.tooltip = `✓ ${foundFiles.join(", ")}`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = `$(error) v${foundVersions[0]} ⚠️${unique.length - 1}`;
    statusBarItem.tooltip = formatMismatch(versions);
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
    log("ERR", `Incongruencia: ${unique.join(" vs ")}`);
  }

  statusBarItem.show();
}

function formatMismatch(versions) {
  const groups = {};
  for (const [file, data] of Object.entries(versions)) {
    const v = data.version || "?";
    groups[v] = groups[v] || [];
    groups[v].push(file);
  }
  return Object.entries(groups)
    .map(([v, files]) => `${v}: ${files.join(", ")}`)
    .join("\n");
}

async function showDetails() {
  if (!config._configured) {
    const action = await vscode.window.showInformationMessage(
      "Version Checker no configurado",
      "Abrir Settings",
    );
    if (action)
      vscode.commands.executeCommand("workbench.action.openSettingsJson");
    return;
  }

  updateStatus();
  const versions = getVersions();
  const items = Object.entries(versions).map(([name, data]) => ({
    label: `${data.found ? "$(check)" : "$(error)"} ${name}`,
    description: data.found
      ? `v${data.version}`
      : data.error || "No encontrado",
    detail: data.path,
    data,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: "Version Checker",
    placeHolder: "Selecciona para abrir",
  });

  if (selected?.data?.path) {
    const doc = await vscode.workspace.openTextDocument(selected.data.path);
    await vscode.window.showTextDocument(doc);
  }
}

async function toggleExtension() {
  const config = vscode.workspace.getConfiguration("versionChecker");
  const current = config.get("enabled", null);
  const newValue = current === false ? true : false;

  await config.update(
    "enabled",
    newValue,
    vscode.ConfigurationTarget.Workspace,
  );

  vscode.window.showInformationMessage(
    `Version Checker ${newValue ? "activado" : "desactivado"} para este workspace`,
  );

  log("INF", `${newValue ? "Activado" : "Desactivado"} manualmente`);
}

function deactivate() {
  statusBarItem?.dispose();
  outputChannel?.dispose();
}

module.exports = { activate, deactivate };
