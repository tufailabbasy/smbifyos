const { loadStorageSettingsSync } = require("./storage-settings");

function getStorageSummary() {
  return loadStorageSettingsSync();
}

function getGmbDownloadsDir() {
  return getStorageSummary().effectiveDirs.downloadsDir;
}

function getGmbJobsDir() {
  return getStorageSummary().effectiveDirs.jobsDir;
}

function getGmbRankTrackerDir() {
  return getStorageSummary().effectiveDirs.rankTrackerDir;
}

function getOutputDir() {
  return getStorageSummary().effectiveDirs.outputDir;
}

function getAllowedDownloadRoots() {
  const settings = getStorageSummary();
  return Array.isArray(settings.downloadRoots) ? settings.downloadRoots : [settings.effectiveDirs.downloadsDir];
}

module.exports = {
  getStorageSummary,
  getGmbDownloadsDir,
  getGmbJobsDir,
  getGmbRankTrackerDir,
  getOutputDir,
  getAllowedDownloadRoots,
};

Object.defineProperties(module.exports, {
  GMB_DOWNLOADS_DIR: {
    enumerable: true,
    get: getGmbDownloadsDir,
  },
  GMB_JOBS_DIR: {
    enumerable: true,
    get: getGmbJobsDir,
  },
  GMB_RANK_TRACKER_DIR: {
    enumerable: true,
    get: getGmbRankTrackerDir,
  },
  OUTPUT_DIR: {
    enumerable: true,
    get: getOutputDir,
  },
});
