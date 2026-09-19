const fs = require("fs");
const fsPromises = require("fs/promises");
const os = require("os");
const path = require("path");

const SETTINGS_DIR = path.resolve(process.env.LOCALAPPDATA || os.tmpdir(), "BizFinder Pro Settings");
const SETTINGS_PATH = path.join(SETTINGS_DIR, "storage-settings.json");

let cachedSettings = null;

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function uniquePaths(values = []) {
  const seen = new Set();

  return values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .map((value) => path.resolve(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function resolveLegacyConfiguredPath(envName, fallbackSegments = []) {
  const configuredValue = cleanText(process.env[envName]);

  if (configuredValue) {
    return path.resolve(configuredValue);
  }

  return path.resolve(__dirname, "..", ...fallbackSegments);
}

function deriveWorkspaceDirectories(workspaceRoot = "") {
  const resolvedRoot = path.resolve(workspaceRoot);

  return {
    workspaceRoot: resolvedRoot,
    downloadsDir: path.join(resolvedRoot, "gmb-photo-downloads"),
    rankTrackerDir: path.join(resolvedRoot, "gmb-rank-tracker"),
    outputDir: path.join(resolvedRoot, "exports"),
  };
}

function getLegacyDefaults() {
  return {
    downloadsDir: resolveLegacyConfiguredPath("GMB_PHOTO_DOWNLOADS_DIR", ["data", "gmb-photo-downloads"]),
    jobsDir: resolveLegacyConfiguredPath("GMB_PHOTO_JOBS_DIR", ["data", "gmb-photo-jobs"]),
    rankTrackerDir: resolveLegacyConfiguredPath("GMB_RANK_TRACKER_DIR", ["data", "gmb-rank-tracker"]),
    outputDir: resolveLegacyConfiguredPath("BIZFINDER_OUTPUT_DIR", ["output"]),
  };
}

function normalizeSettings(record = {}) {
  const legacyDefaults = getLegacyDefaults();
  const configuredWorkspaceRoot = cleanText(record.workspaceRoot);
  const activeWorkspace = configuredWorkspaceRoot ? deriveWorkspaceDirectories(configuredWorkspaceRoot) : null;
  const effectiveDirs = {
    workspaceRoot: activeWorkspace?.workspaceRoot || "",
    downloadsDir: activeWorkspace?.downloadsDir || legacyDefaults.downloadsDir,
    rankTrackerDir: activeWorkspace?.rankTrackerDir || legacyDefaults.rankTrackerDir,
    outputDir: activeWorkspace?.outputDir || legacyDefaults.outputDir,
    jobsDir: legacyDefaults.jobsDir,
  };

  return {
    workspaceRoot: effectiveDirs.workspaceRoot,
    usingCustomWorkspace: Boolean(effectiveDirs.workspaceRoot),
    updatedAt: cleanText(record.updatedAt),
    downloadRoots: uniquePaths([
      ...(Array.isArray(record.downloadRoots) ? record.downloadRoots : []),
      effectiveDirs.downloadsDir,
      legacyDefaults.downloadsDir,
    ]),
    legacyDefaults,
    effectiveDirs,
  };
}

function ensureSettingsDirSync() {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

async function ensureSettingsDir() {
  await fsPromises.mkdir(SETTINGS_DIR, { recursive: true });
}

function loadStorageSettingsSync() {
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
      cachedSettings = normalizeSettings(JSON.parse(raw));
      return cachedSettings;
    }
  } catch (error) {
    console.error(`[storage-settings] Failed to load storage settings: ${error.message}`);
  }

  cachedSettings = normalizeSettings({});
  return cachedSettings;
}

async function readStorageSettings() {
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const raw = await fsPromises.readFile(SETTINGS_PATH, "utf8");
    cachedSettings = normalizeSettings(JSON.parse(raw));
    return cachedSettings;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`[storage-settings] Failed to read storage settings: ${error.message}`);
    }

    cachedSettings = normalizeSettings({});
    return cachedSettings;
  }
}

async function persistStorageSettings(record = {}) {
  const normalizedSettings = normalizeSettings({
    ...record,
    updatedAt: new Date().toISOString(),
  });

  await ensureSettingsDir();
  await fsPromises.writeFile(SETTINGS_PATH, `${JSON.stringify(normalizedSettings, null, 2)}\n`, "utf8");
  cachedSettings = normalizedSettings;
  return normalizedSettings;
}

async function setStorageWorkspaceRoot(workspaceRoot = "") {
  const normalizedRoot = cleanText(workspaceRoot);
  if (!normalizedRoot) {
    return resetStorageWorkspaceRoot();
  }

  const currentSettings = await readStorageSettings();

  return persistStorageSettings({
    ...currentSettings,
    workspaceRoot: path.resolve(normalizedRoot),
    downloadRoots: uniquePaths([
      ...(currentSettings.downloadRoots || []),
      currentSettings.effectiveDirs.downloadsDir,
      deriveWorkspaceDirectories(normalizedRoot).downloadsDir,
    ]),
  });
}

async function resetStorageWorkspaceRoot() {
  const currentSettings = await readStorageSettings();

  return persistStorageSettings({
    ...currentSettings,
    workspaceRoot: "",
    downloadRoots: uniquePaths([
      ...(currentSettings.downloadRoots || []),
      currentSettings.effectiveDirs.downloadsDir,
    ]),
  });
}

module.exports = {
  SETTINGS_DIR,
  SETTINGS_PATH,
  deriveWorkspaceDirectories,
  getLegacyDefaults,
  loadStorageSettingsSync,
  readStorageSettings,
  setStorageWorkspaceRoot,
  resetStorageWorkspaceRoot,
};
