const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const {
  createJob,
  updateJob,
  getJob,
  listJobs,
  cancelJob,
  pauseJob,
  resumeJob,
} = require("./modules/job-manager");
const {
  searchGmbListings,
  extractGmbListingPhotos,
  buildDiscoveryQueries,
  DEFAULT_LISTINGS_LIMIT,
  DEFAULT_PHOTOS_LIMIT,
  MAX_LISTINGS_LIMIT,
  MAX_PHOTOS_LIMIT,
} = require("./modules/gmb-photo-scraper");
const {
  createGmbPhotoJob,
  updateGmbPhotoJob,
  getGmbPhotoJob,
  listGmbPhotoJobs,
  cancelGmbPhotoJob,
  pauseGmbPhotoJob,
  resumeGmbPhotoJob,
} = require("./modules/gmb-photo-job-manager");
const { generateCSV } = require("./modules/csv-export");
const { generateGmbPhotoCsv } = require("./modules/gmb-photo-csv-export");
const { STATE_CATALOG } = require("./modules/state-catalog");
const { getStorageSummary, getGmbDownloadsDir, getGmbRankTrackerDir, getOutputDir, getAllowedDownloadRoots } = require("./modules/storage-paths");
const { readStorageSettings, setStorageWorkspaceRoot, resetStorageWorkspaceRoot } = require("./modules/storage-settings");

const router = express.Router();
const DATA_DIR = path.resolve(__dirname, "data");
const states = STATE_CATALOG;

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeStateId(value = "") {
  return cleanText(value).toLowerCase();
}

function normalizeJobLimit(value) {
  const normalizedValue = cleanText(value);

  if (
    value === null ||
    value === undefined ||
    normalizedValue === "" ||
    normalizedValue.toLowerCase() === "all"
  ) {
    return null;
  }

  const numericLimit = Number(value);
  if (Number.isFinite(numericLimit) && numericLimit > 0) {
    return numericLimit;
  }

  return Number.NaN;
}

function normalizePositiveIntegerRange(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const normalizedValue = cleanText(value);

  if (!normalizedValue) {
    return fallback;
  }

  const numericValue = Number(normalizedValue);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return Number.NaN;
  }

  return Math.min(Math.max(Math.round(numericValue), min), max);
}

function sanitizeFilePart(value = "", fallback = "unknown") {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function formatJobTarget(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0
    ? String(Number(value))
    : "all available";
}

function isPathInside(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return !relativePath || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function openFolderInExplorer(folderPath) {
  const explorer = spawn("explorer.exe", [folderPath], {
    detached: true,
    stdio: "ignore",
  });

  explorer.unref();
}

function isPathInsideAny(rootPaths = [], targetPath = "") {
  return rootPaths.some((rootPath) => isPathInside(path.resolve(rootPath), targetPath));
}

function getStorageOpenPath(settings = getStorageSummary()) {
  return cleanText(settings?.workspaceRoot) || cleanText(settings?.effectiveDirs?.downloadsDir);
}

function serializeStorageSettings(settings = getStorageSummary()) {
  return {
    workspaceRoot: cleanText(settings?.workspaceRoot),
    usingCustomWorkspace: Boolean(settings?.usingCustomWorkspace),
    effectiveDirs: {
      workspaceRoot: cleanText(settings?.effectiveDirs?.workspaceRoot),
      downloadsDir: cleanText(settings?.effectiveDirs?.downloadsDir),
      rankTrackerDir: cleanText(settings?.effectiveDirs?.rankTrackerDir),
      outputDir: cleanText(settings?.effectiveDirs?.outputDir),
      jobsDir: cleanText(settings?.effectiveDirs?.jobsDir),
    },
    legacyDefaults: {
      downloadsDir: cleanText(settings?.legacyDefaults?.downloadsDir),
      rankTrackerDir: cleanText(settings?.legacyDefaults?.rankTrackerDir),
      outputDir: cleanText(settings?.legacyDefaults?.outputDir),
      jobsDir: cleanText(settings?.legacyDefaults?.jobsDir),
    },
    openPath: getStorageOpenPath(settings),
    note: settings?.usingCustomWorkspace
      ? "New runs will save into the selected workspace folder immediately."
      : "The app is still using its built-in local folders. Choose a workspace folder if you want a clearer save location.",
  };
}

async function ensureStorageDirectories(settings = getStorageSummary()) {
  await Promise.all([
    cleanText(settings?.workspaceRoot) ? ensureDirectory(settings.workspaceRoot) : Promise.resolve(),
    ensureDirectory(settings?.effectiveDirs?.downloadsDir),
    ensureDirectory(settings?.effectiveDirs?.rankTrackerDir),
    ensureDirectory(settings?.effectiveDirs?.outputDir),
    ensureDirectory(settings?.effectiveDirs?.jobsDir),
  ]);
}

function openFolderPicker(initialPath = "") {
  return new Promise((resolve, reject) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = 'Choose a folder for BizFinder Pro saved data'",
      "$dialog.ShowNewFolderButton = $true",
      "$initial = '" + escapePowerShellLiteral(initialPath) + "'",
      "if ($initial -and (Test-Path -LiteralPath $initial)) { $dialog.SelectedPath = $initial }",
      "$result = $dialog.ShowDialog()",
      "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $dialog.SelectedPath }",
    ].join("; ");

    const pickerProcess = spawn("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    pickerProcess.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    pickerProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    pickerProcess.on("error", (error) => {
      reject(error);
    });

    pickerProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(cleanText(stderr) || `Folder picker failed with exit code ${code}.`));
        return;
      }

      resolve(cleanText(stdout));
    });
  });
}

async function ensureDirectory(directoryPath = "") {
  if (!cleanText(directoryPath)) {
    return;
  }

  await fsPromises.mkdir(directoryPath, { recursive: true });
}

function escapePowerShellLiteral(value = "") {
  return String(value ?? "").replace(/'/g, "''");
}

function createZipFromDirectory(sourceDirectory, destinationZipPath) {
  return new Promise((resolve, reject) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$source = '" + escapePowerShellLiteral(sourceDirectory) + "'",
      "$destination = '" + escapePowerShellLiteral(destinationZipPath) + "'",
      "if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      "[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $destination)",
    ].join("; ");

    const zipProcess = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let errorOutput = "";
    zipProcess.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });

    zipProcess.on("error", (error) => {
      reject(error);
    });

    zipProcess.on("close", (code) => {
      if (code === 0) {
        resolve(destinationZipPath);
        return;
      }

      reject(new Error(cleanText(errorOutput) || "Photo zip export failed with exit code " + code + "."));
    });
  });
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function getStateConfig(stateId) {
  return states.find((state) => state.id === stateId) || null;
}

function createFallbackScraper(stateConfig) {
  return {
    async scrape({ businessType, limit, onProgress } = {}) {
      void businessType;
      void limit;
      void onProgress;

      console.log(
        `[scraper] ${stateConfig?.name || "This state"} scraper not yet configured -- selectors needed. Registry: ${
          stateConfig?.registryUrl || "not set"
        }`
      );

      return [];
    },
  };
}

function getScraperForState(stateId) {
  const stateConfig = getStateConfig(stateId);
  const scraperPath = path.join(__dirname, "scrapers", `${stateId}.js`);

  if (!fs.existsSync(scraperPath)) {
    console.log(
      `[routes] No dedicated scraper file found for ${stateId}. Using generic coming-soon scraper.`
    );
    return createFallbackScraper(stateConfig);
  }

  try {
    return require(scraperPath);
  } catch (error) {
    throw new Error(`Unable to load scraper for state "${stateId}": ${error.message}`);
  }
}

function getJobFilePaths(jobId) {
  return {
    rawDataPath: path.join(DATA_DIR, `raw_${jobId}.json`),
    resultsPath: path.join(DATA_DIR, `results_${jobId}.json`),
  };
}

async function ensureDataDir() {
  await fsPromises.mkdir(DATA_DIR, { recursive: true });
}

async function writeJsonFile(filePath, data) {
  await ensureDataDir();
  await fsPromises.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`[job-flow] Saved JSON file ${filePath}`);
}

async function fileExists(filePath = "") {
  try {
    if (!cleanText(filePath)) {
      return false;
    }

    await fsPromises.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function listRankTrackerHistory(keyword = "", location = "") {
  const keywordFolder = sanitizeFilePart(keyword, "keyword");
  const locationFolder = sanitizeFilePart(location, "location");
  const targetDir = path.join(getGmbRankTrackerDir(), `${keywordFolder}__${locationFolder}`);

  if (!(await fileExists(targetDir))) {
    return [];
  }

  const entries = await fsPromises.readdir(targetDir, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, 20);

  const items = [];

  for (const fileName of fileNames) {
    try {
      const raw = await fsPromises.readFile(path.join(targetDir, fileName), "utf8");
      const parsed = JSON.parse(raw);
      items.push({
        snapshotId: cleanText(parsed.snapshotId || fileName.replace(/\.json$/i, "")),
        capturedAt: cleanText(parsed.capturedAt),
        serpProvider: cleanText(parsed.serpProvider),
        totalListings: Array.isArray(parsed.listings) ? parsed.listings.length : 0,
        totalQueries: Array.isArray(parsed.queriesUsed) ? parsed.queriesUsed.length : 0,
        filePath: path.join(targetDir, fileName),
      });
    } catch (error) {
      console.error(`[routes] Failed to read rank tracker snapshot ${fileName}: ${error.message}`);
    }
  }

  return items;
}

function canExportJob(job) {
  const normalizedStatus = cleanText(job?.status).toLowerCase();
  return ["complete", "cancelled"].includes(normalizedStatus);
}

async function resolveCsvPath(job) {
  const currentCsvPath = cleanText(job?.csvPath);

  if (currentCsvPath && (await fileExists(currentCsvPath))) {
    return currentCsvPath;
  }

  if (!canExportJob(job)) {
    return "";
  }

  if (!Array.isArray(job?.results)) {
    return "";
  }

  console.log(
    `[routes] CSV file missing for job ${job.jobId}. Regenerating from in-memory results.`
  );

  const regeneratedCsvPath = await generateCSV(job.jobId, job.results);
  updateJob(job.jobId, {
    csvPath: regeneratedCsvPath,
  });

  return regeneratedCsvPath;
}

function summarizeJobResults(results = []) {
  return results.reduce(
    (summary, result) => {
      const hasGmbOutcome = hasOwn(result, "gmbExists");
      const hasScrapeError = result?.error === true;

      if (hasGmbOutcome) {
        summary.gmbChecked += 1;

        if (result.gmbExists === true && !hasScrapeError) {
          summary.hasGMB += 1;
        } else if (result.gmbExists === false && !hasScrapeError) {
          summary.noGMB += 1;
        } else {
          summary.errors += 1;
        }

        return summary;
      }

      if (hasScrapeError) {
        summary.errors += 1;
      }

      return summary;
    },
    {
      gmbChecked: 0,
      hasGMB: 0,
      noGMB: 0,
      errors: 0,
    }
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function summarizeGmbPhotoJob(job = {}) {
  return {
    jobId: cleanText(job.jobId),
    keyword: cleanText(job.keyword),
    location: cleanText(job.location),
    listingsPerQuery: Number(job.listingsPerQuery) || 0,
    photosPerListing: Number(job.photosPerListing) || 0,
    tag: cleanText(job.tag) || "all",
    status: cleanText(job.status),
    phase: cleanText(job.phase),
    startedAt: job.startedAt || "",
    completedAt: job.completedAt || null,
    totalQueries: Number(job.totalQueries) || 0,
    processedQueries: Number(job.processedQueries) || 0,
    totalListings: Number(job.totalListings) || 0,
    processedListings: Number(job.processedListings) || 0,
    totalPhotos: Number(job.totalPhotos) || 0,
    downloadedPhotos: Number(job.downloadedPhotos) || 0,
    downloadRootDir: cleanText(job.downloadRootDir),
    downloadSessionDir: cleanText(job.downloadSessionDir),
    serpQuery: cleanText(job.serpQuery),
    serpProvider: cleanText(job.serpProvider),
    serpResults: Array.isArray(job.serpResults) ? job.serpResults : [],
    rankSnapshotId: cleanText(job.rankSnapshotId),
    rankSnapshotPath: cleanText(job.rankSnapshotPath),
    snapshotCapturedAt: cleanText(job.snapshotCapturedAt),
    cancelRequested: Boolean(job.cancelRequested),
    pauseRequested: Boolean(job.pauseRequested),
    pausedAt: job.pausedAt || null,
    errorMessage: cleanText(job.errorMessage),
    csvPath: cleanText(job.csvPath),
    photosZipPath: cleanText(job.photosZipPath),
  };
}

async function ensureGmbPhotoCsv(jobId) {
  const job = getGmbPhotoJob(jobId);

  if (!job) {
    return "";
  }

  const currentCsvPath = cleanText(job.csvPath);
  if (currentCsvPath && fs.existsSync(currentCsvPath)) {
    return currentCsvPath;
  }

  const csvPath = await generateGmbPhotoCsv(job);
  updateGmbPhotoJob(jobId, { csvPath });
  return csvPath;
}

async function ensureGmbPhotoZip(jobId) {
  const job = getGmbPhotoJob(jobId);

  if (!job) {
    return "";
  }

  const currentZipPath = cleanText(job.photosZipPath);
  if (currentZipPath && fs.existsSync(currentZipPath)) {
    return currentZipPath;
  }

  const folderPathValue = cleanText(job.downloadSessionDir) || cleanText(job.downloadRootDir);
  if (!folderPathValue) {
    return "";
  }

  const resolvedFolderPath = path.resolve(folderPathValue);
  if (!isPathInsideAny(getAllowedDownloadRoots(), resolvedFolderPath) || !fs.existsSync(resolvedFolderPath)) {
    return "";
  }

  await ensureDirectory(getOutputDir());
  const zipFileName = "gmb_photos_" + sanitizeFilePart(job.keyword, "keyword") + "_" + sanitizeFilePart(job.location, "location") + "_" + sanitizeFilePart(job.jobId, "job") + ".zip";
  const zipPath = path.join(getOutputDir(), zipFileName);

  await createZipFromDirectory(resolvedFolderPath, zipPath);
  updateGmbPhotoJob(jobId, { photosZipPath: zipPath });
  return zipPath;
}

async function ensureGmbPhotoArtifacts(jobId) {
  const job = getGmbPhotoJob(jobId);

  if (!job) {
    return {
      csvPath: "",
      photosZipPath: "",
    };
  }

  const csvPath = await ensureGmbPhotoCsv(jobId);
  const photosZipPath = await ensureGmbPhotoZip(jobId);

  return {
    csvPath,
    photosZipPath,
  };
}

function buildJobStageUpdate(jobId, desiredStatus, updates = {}) {
  const currentJob = getJob(jobId);
  const isTerminal = ["complete", "cancelled", "error"].includes(desiredStatus);

  return {
    ...updates,
    status:
      !isTerminal && currentJob?.pauseRequested
        ? "paused"
        : desiredStatus,
    phase: desiredStatus,
    pauseRequested: isTerminal ? false : currentJob?.pauseRequested || false,
    pausedAt: isTerminal ? null : currentJob?.pausedAt || null,
  };
}

function buildGmbPhotoStageUpdate(jobId, desiredStatus, updates = {}) {
  const currentJob = getGmbPhotoJob(jobId);
  const isTerminal = ["complete", "cancelled", "error"].includes(desiredStatus);

  return {
    ...updates,
    status:
      !isTerminal && currentJob?.pauseRequested
        ? "paused"
        : desiredStatus,
    phase: desiredStatus,
    pauseRequested: isTerminal ? false : currentJob?.pauseRequested || false,
    pausedAt: isTerminal ? null : currentJob?.pausedAt || null,
  };
}

async function waitWhilePaused(jobId, contextLabel = "job") {
  let currentJob = getJob(jobId);
  let hasLoggedPause = false;

  while (currentJob?.pauseRequested && !currentJob?.cancelRequested) {
    if (!hasLoggedPause) {
      console.log(`[job-flow] Job ${jobId} paused during ${contextLabel}.`);
      hasLoggedPause = true;
    }

    if (currentJob.status !== "paused") {
      updateJob(jobId, {
        status: "paused",
        pausedAt: currentJob.pausedAt || new Date().toISOString(),
      });
    }

    await sleep(1000);
    currentJob = getJob(jobId);
  }

  if (hasLoggedPause && currentJob && !currentJob.cancelRequested) {
    console.log(`[job-flow] Job ${jobId} resumed during ${contextLabel}.`);
  }

  return currentJob;
}

async function waitWhileGmbPhotoJobPaused(jobId, contextLabel = "job") {
  let currentJob = getGmbPhotoJob(jobId);
  let hasLoggedPause = false;

  while (currentJob?.pauseRequested && !currentJob?.cancelRequested) {
    if (!hasLoggedPause) {
      console.log(`[gmb-photo-job] Job ${jobId} paused during ${contextLabel}.`);
      hasLoggedPause = true;
    }

    if (currentJob.status !== "paused") {
      updateGmbPhotoJob(jobId, {
        status: "paused",
        pausedAt: currentJob.pausedAt || new Date().toISOString(),
      });
    }

    await sleep(1000);
    currentJob = getGmbPhotoJob(jobId);
  }

  if (hasLoggedPause && currentJob && !currentJob.cancelRequested) {
    console.log(`[gmb-photo-job] Job ${jobId} resumed during ${contextLabel}.`);
  }

  return currentJob;
}

async function finalizeCancelledJob(jobId, mergedResults, filePaths) {
  const results = Array.isArray(mergedResults) ? mergedResults : [];
  const stats = summarizeJobResults(results);
  let csvPath = "";

  try {
    await writeJsonFile(filePaths.resultsPath, results);
  } catch (error) {
    console.error(
      `[job-flow] Failed to save cancelled results for job ${jobId}: ${error.message}`
    );
  }

  try {
    csvPath = await generateCSV(jobId, results);
  } catch (error) {
    console.error(
      `[job-flow] Failed to generate cancelled CSV for job ${jobId}: ${error.message}`
    );
  }

  updateJob(jobId, {
    ...buildJobStageUpdate(jobId, "cancelled", {}),
    completedAt: new Date().toISOString(),
    results,
    resultsPath: filePaths.resultsPath,
    csvPath,
    gmbChecked: stats.gmbChecked,
    hasGMB: stats.hasGMB,
    noGMB: stats.noGMB,
    errors: stats.errors,
  });

  console.log(`[job-flow] Job ${jobId} marked as cancelled.`);
}

async function runJobPipeline(job) {
  const jobId = job.jobId;
  const filePaths = getJobFilePaths(jobId);
  let rawResults = [];
  let mergedResults = [];

  try {
    console.log(
      `[job-flow] Starting background job ${jobId} for ${job.state} / ${job.businessType}`
    );

    updateJob(jobId, {
      ...buildJobStageUpdate(jobId, "scraping"),
      rawDataPath: filePaths.rawDataPath,
      resultsPath: filePaths.resultsPath,
      csvPath: "",
      errorMessage: "",
      completedAt: null,
    });

    const scraper = getScraperForState(job.state);

    if (!scraper || typeof scraper.scrape !== "function") {
      throw new Error(`Scraper for state "${job.state}" does not export scrape().`);
    }

    const jobBeforeScrape = await waitWhilePaused(jobId, "scraping");

    if (jobBeforeScrape?.cancelRequested) {
      console.log(`[job-flow] Job ${jobId} was cancelled before scraping started.`);
      await finalizeCancelledJob(jobId, mergedResults, filePaths);
      return;
    }

    rawResults = await scraper.scrape({
      businessType: job.businessType,
      limit: job.limit,
      waitIfPaused: async () => waitWhilePaused(jobId, "scraping"),
      shouldCancel: () => Boolean(getJob(jobId)?.cancelRequested),
      onProgress: async ({ scraped, total }) => {
        try {
          const currentJob = getJob(jobId);

          if (!currentJob) {
            return;
          }

          const nextStatus =
            currentJob.status === "paused"
              ? "paused"
              : currentJob.status === "running"
                ? "scraping"
                : "scraping";

          updateJob(jobId, {
            status: nextStatus,
            phase: "scraping",
            scraped: Number(scraped) || currentJob.scraped,
            total:
              Number.isFinite(Number(total)) && Number(total) > 0
                ? Number(total)
                : currentJob.total || job.limit || null,
          });

          console.log(
            `[job-flow] Job ${jobId} scrape progress ${Number(scraped) || 0}/${formatJobTarget(
              total || currentJob.total || job.limit
            )}`
          );
        } catch (error) {
          console.error(
            `[job-flow] Failed to update scrape progress for job ${jobId}: ${error.message}`
          );
        }
      },
    });

    rawResults = Array.isArray(rawResults) ? rawResults : [];
    mergedResults = rawResults.map((result) => ({ ...result }));

    await writeJsonFile(filePaths.rawDataPath, rawResults);

    const scrapeStats = summarizeJobResults(mergedResults);

    if (getJob(jobId)?.cancelRequested) {
      console.log(`[job-flow] Job ${jobId} was cancelled during scraping.`);
      await finalizeCancelledJob(jobId, mergedResults, filePaths);
      return;
    }

    if (getJob(jobId)?.cancelRequested) {
      console.log(
        `[job-flow] Job ${jobId} cancellation detected after scraping and before export.`
      );
      await finalizeCancelledJob(jobId, mergedResults, filePaths);
      return;
    }

    await writeJsonFile(filePaths.resultsPath, mergedResults);
    const csvPath = await generateCSV(jobId, mergedResults);

    const finalStats = summarizeJobResults(mergedResults);
    updateJob(jobId, {
      ...buildJobStageUpdate(jobId, "complete"),
      completedAt: new Date().toISOString(),
      scraped: rawResults.length,
      total: rawResults.length,
      gmbChecked: finalStats.gmbChecked,
      hasGMB: finalStats.hasGMB,
      noGMB: finalStats.noGMB,
      errors: finalStats.errors,
      results: mergedResults,
      rawDataPath: filePaths.rawDataPath,
      resultsPath: filePaths.resultsPath,
      csvPath,
    });

    console.log(`[job-flow] Job ${jobId} completed successfully.`);
  } catch (error) {
    console.error(`[job-flow] Job ${jobId} failed: ${error.message}`);

    const currentJob = getJob(jobId);
    const partialResults = Array.isArray(currentJob?.results)
      ? currentJob.results
      : mergedResults;
    const partialStats = summarizeJobResults(partialResults);

    try {
      if (partialResults.length) {
        await writeJsonFile(filePaths.resultsPath, partialResults);
      }
    } catch (writeError) {
      console.error(
        `[job-flow] Failed to save partial results for job ${jobId}: ${writeError.message}`
      );
    }

    updateJob(jobId, {
      ...buildJobStageUpdate(jobId, "error"),
      completedAt: new Date().toISOString(),
      scraped: rawResults.length,
      total: rawResults.length,
      gmbChecked: partialStats.gmbChecked,
      hasGMB: partialStats.hasGMB,
      noGMB: partialStats.noGMB,
      errors: partialStats.errors || 1,
      results: partialResults,
      rawDataPath: filePaths.rawDataPath,
      resultsPath: filePaths.resultsPath,
      errorMessage: cleanText(error.message),
    });
  }
}

async function finalizeCancelledGmbPhotoJob(jobId, updates = {}) {
  const currentJob = getGmbPhotoJob(jobId);

  updateGmbPhotoJob(jobId, {
    ...buildGmbPhotoStageUpdate(jobId, "cancelled", updates),
    completedAt: new Date().toISOString(),
    keyword: currentJob?.keyword || "",
    location: currentJob?.location || "",
  });

  try {
    await ensureGmbPhotoArtifacts(jobId);
  } catch (error) {
    console.error(`[gmb-photo-job] Failed to generate cancelled files for ${jobId}: ${error.message}`);
  }

  console.log(`[gmb-photo-job] Job ${jobId} marked as cancelled.`);
}

async function runGmbPhotoJobPipeline(job) {
  const jobId = job.jobId;

  try {
    console.log(
      `[gmb-photo-job] Starting background job ${jobId} for ${job.keyword} / ${job.location}`
    );

    const initialQueries = buildDiscoveryQueries({
      keyword: job.keyword,
      location: job.location,
    });

    updateGmbPhotoJob(jobId, {
      ...buildGmbPhotoStageUpdate(jobId, "searching"),
      completedAt: null,
      errorMessage: "",
      totalQueries: initialQueries.length,
      processedQueries: 0,
      totalListings: 0,
      processedListings: 0,
      totalPhotos: 0,
      downloadedPhotos: 0,
      downloadRootDir: "",
      downloadSessionDir: "",
      serpQuery: "",
      serpProvider: "",
      serpResults: [],
      rankSnapshotId: "",
      rankSnapshotPath: "",
      snapshotCapturedAt: "",
      queriesUsed: initialQueries,
      listings: [],
      photoItems: [],
    });

    const jobBeforeSearch = await waitWhileGmbPhotoJobPaused(jobId, "listing discovery");

    if (jobBeforeSearch?.cancelRequested) {
      await finalizeCancelledGmbPhotoJob(jobId);
      return;
    }

    const searchResult = await searchGmbListings({
      keyword: job.keyword,
      location: job.location,
      listingsPerQuery: job.listingsPerQuery,
      sessionId: jobId,
      waitIfPaused: async () => waitWhileGmbPhotoJobPaused(jobId, "listing discovery"),
      shouldCancel: () => Boolean(getGmbPhotoJob(jobId)?.cancelRequested),
      onProgress: async ({
        processedQueries,
        totalQueries,
        totalListings,
        serpResults,
        queriesUsed,
        listings,
      }) => {
        updateGmbPhotoJob(jobId, {
          ...buildGmbPhotoStageUpdate(jobId, "searching"),
          processedQueries: Number(processedQueries) || 0,
          totalQueries: Number(totalQueries) || 0,
          totalListings: Number(totalListings) || 0,
          serpResults: Array.isArray(serpResults) ? serpResults : [],
          queriesUsed: Array.isArray(queriesUsed) ? queriesUsed : [],
          listings: Array.isArray(listings) ? listings : [],
        });
      },
    });

    updateGmbPhotoJob(jobId, {
      ...buildGmbPhotoStageUpdate(jobId, "searching"),
      processedQueries: Number(searchResult.processedQueries) || 0,
      totalQueries: searchResult.queriesUsed.length,
      totalListings: searchResult.totalListings,
      serpQuery: searchResult.serpQuery,
      serpProvider: searchResult.serpProvider,
      serpResults: searchResult.serpResults,
      rankSnapshotId: searchResult.rankSnapshotId,
      rankSnapshotPath: searchResult.rankSnapshotPath,
      snapshotCapturedAt: searchResult.snapshotCapturedAt,
      queriesUsed: searchResult.queriesUsed,
      listings: searchResult.listings,
    });

    if (getGmbPhotoJob(jobId)?.cancelRequested) {
      await finalizeCancelledGmbPhotoJob(jobId, {
        processedQueries: Number(searchResult.processedQueries) || 0,
        totalQueries: searchResult.queriesUsed.length,
        totalListings: searchResult.totalListings,
        serpQuery: searchResult.serpQuery,
        serpProvider: searchResult.serpProvider,
        serpResults: searchResult.serpResults,
        rankSnapshotId: searchResult.rankSnapshotId,
        rankSnapshotPath: searchResult.rankSnapshotPath,
        snapshotCapturedAt: searchResult.snapshotCapturedAt,
        queriesUsed: searchResult.queriesUsed,
        listings: searchResult.listings,
      });
      return;
    }

    if (!searchResult.listings.length) {
      updateGmbPhotoJob(jobId, {
        ...buildGmbPhotoStageUpdate(jobId, "complete"),
        completedAt: new Date().toISOString(),
        processedQueries: Number(searchResult.processedQueries) || 0,
        totalQueries: searchResult.queriesUsed.length,
        totalListings: 0,
        processedListings: 0,
        totalPhotos: 0,
        downloadedPhotos: 0,
        serpQuery: searchResult.serpQuery,
        serpProvider: searchResult.serpProvider,
        serpResults: searchResult.serpResults,
        rankSnapshotId: searchResult.rankSnapshotId,
        rankSnapshotPath: searchResult.rankSnapshotPath,
        snapshotCapturedAt: searchResult.snapshotCapturedAt,
        queriesUsed: searchResult.queriesUsed,
        listings: [],
        photoItems: [],
      });

      await ensureGmbPhotoArtifacts(jobId);

      console.log(`[gmb-photo-job] Job ${jobId} completed with zero listings.`);
      return;
    }

    await waitWhileGmbPhotoJobPaused(jobId, "between search and photo extraction");

    updateGmbPhotoJob(jobId, {
      ...buildGmbPhotoStageUpdate(jobId, "extracting_photos"),
      processedQueries: Number(searchResult.processedQueries) || 0,
      totalQueries: searchResult.queriesUsed.length,
      totalListings: searchResult.totalListings,
      processedListings: 0,
      totalPhotos: 0,
      downloadedPhotos: 0,
      serpQuery: searchResult.serpQuery,
      serpProvider: searchResult.serpProvider,
      serpResults: searchResult.serpResults,
      rankSnapshotId: searchResult.rankSnapshotId,
      rankSnapshotPath: searchResult.rankSnapshotPath,
      snapshotCapturedAt: searchResult.snapshotCapturedAt,
      queriesUsed: searchResult.queriesUsed,
      listings: searchResult.listings,
      photoItems: [],
    });

    const photoResult = await extractGmbListingPhotos({
      listings: searchResult.listings,
      photosPerListing: job.photosPerListing,
      tag: job.tag,
      keyword: job.keyword,
      location: job.location,
      jobId,
      waitIfPaused: async () => waitWhileGmbPhotoJobPaused(jobId, "photo extraction"),
      shouldCancel: () => Boolean(getGmbPhotoJob(jobId)?.cancelRequested),
      onProgress: async ({
        processedListings,
        totalListings,
        totalPhotos,
        downloadedPhotos,
        downloadRootDir,
        downloadSessionDir,
        items,
      }) => {
        updateGmbPhotoJob(jobId, {
          ...buildGmbPhotoStageUpdate(jobId, "extracting_photos"),
          processedQueries: Number(searchResult.processedQueries) || 0,
          totalQueries: searchResult.queriesUsed.length,
          totalListings: Number(totalListings) || searchResult.totalListings,
          processedListings: Number(processedListings) || 0,
          totalPhotos: Number(totalPhotos) || 0,
          downloadedPhotos: Number(downloadedPhotos) || 0,
          downloadRootDir: cleanText(downloadRootDir),
          downloadSessionDir: cleanText(downloadSessionDir),
          serpQuery: searchResult.serpQuery,
          serpProvider: searchResult.serpProvider,
          serpResults: searchResult.serpResults,
          rankSnapshotId: searchResult.rankSnapshotId,
          rankSnapshotPath: searchResult.rankSnapshotPath,
          snapshotCapturedAt: searchResult.snapshotCapturedAt,
          queriesUsed: searchResult.queriesUsed,
          listings: searchResult.listings,
          photoItems: Array.isArray(items) ? items : [],
        });
      },
    });

    if (getGmbPhotoJob(jobId)?.cancelRequested) {
      await finalizeCancelledGmbPhotoJob(jobId, {
        processedQueries: Number(searchResult.processedQueries) || 0,
        totalQueries: searchResult.queriesUsed.length,
        totalListings: searchResult.totalListings,
        processedListings: photoResult.totalListings,
        totalPhotos: photoResult.totalPhotos,
        downloadedPhotos: photoResult.downloadedPhotos,
        downloadRootDir: photoResult.downloadRootDir,
        downloadSessionDir: photoResult.downloadSessionDir,
        serpQuery: searchResult.serpQuery,
        serpProvider: searchResult.serpProvider,
        serpResults: searchResult.serpResults,
        rankSnapshotId: searchResult.rankSnapshotId,
        rankSnapshotPath: searchResult.rankSnapshotPath,
        snapshotCapturedAt: searchResult.snapshotCapturedAt,
        queriesUsed: searchResult.queriesUsed,
        listings: searchResult.listings,
        photoItems: photoResult.items,
      });
      return;
    }

    updateGmbPhotoJob(jobId, {
      ...buildGmbPhotoStageUpdate(jobId, "complete"),
      completedAt: new Date().toISOString(),
      processedQueries: Number(searchResult.processedQueries) || 0,
      totalQueries: searchResult.queriesUsed.length,
      totalListings: searchResult.totalListings,
      processedListings: photoResult.totalListings,
      totalPhotos: photoResult.totalPhotos,
      downloadedPhotos: photoResult.downloadedPhotos,
      downloadRootDir: photoResult.downloadRootDir,
      downloadSessionDir: photoResult.downloadSessionDir,
      serpQuery: searchResult.serpQuery,
      serpProvider: searchResult.serpProvider,
      serpResults: searchResult.serpResults,
      rankSnapshotId: searchResult.rankSnapshotId,
      rankSnapshotPath: searchResult.rankSnapshotPath,
      snapshotCapturedAt: searchResult.snapshotCapturedAt,
      queriesUsed: searchResult.queriesUsed,
      listings: searchResult.listings,
      photoItems: photoResult.items,
    });

    await ensureGmbPhotoArtifacts(jobId);

    console.log(`[gmb-photo-job] Job ${jobId} completed successfully.`);
  } catch (error) {
    console.error(`[gmb-photo-job] Job ${jobId} failed: ${error.message}`);

    const currentJob = getGmbPhotoJob(jobId);

    updateGmbPhotoJob(jobId, {
      ...buildGmbPhotoStageUpdate(jobId, "error"),
      completedAt: new Date().toISOString(),
      processedQueries: Number(currentJob?.processedQueries) || 0,
      totalQueries: Number(currentJob?.totalQueries) || 0,
      totalListings: Number(currentJob?.totalListings) || 0,
      processedListings: Number(currentJob?.processedListings) || 0,
      totalPhotos: Number(currentJob?.totalPhotos) || 0,
      downloadedPhotos: Number(currentJob?.downloadedPhotos) || 0,
      downloadRootDir: cleanText(currentJob?.downloadRootDir),
      downloadSessionDir: cleanText(currentJob?.downloadSessionDir),
      serpQuery: cleanText(currentJob?.serpQuery),
      serpProvider: cleanText(currentJob?.serpProvider),
      serpResults: Array.isArray(currentJob?.serpResults) ? currentJob.serpResults : [],
      rankSnapshotId: cleanText(currentJob?.rankSnapshotId),
      rankSnapshotPath: cleanText(currentJob?.rankSnapshotPath),
      snapshotCapturedAt: cleanText(currentJob?.snapshotCapturedAt),
      queriesUsed: Array.isArray(currentJob?.queriesUsed) ? currentJob.queriesUsed : [],
      listings: Array.isArray(currentJob?.listings) ? currentJob.listings : [],
      photoItems: Array.isArray(currentJob?.photoItems) ? currentJob.photoItems : [],
      errorMessage: cleanText(error.message),
    });

    try {
      await ensureGmbPhotoArtifacts(jobId);
    } catch (artifactError) {
      console.error(`[gmb-photo-job] Failed to generate error files for ${jobId}: ${artifactError.message}`);
    }
  }
}

router.post("/api/job/start", (req, res) => {
  try {
    console.log("[routes] POST /api/job/start");

    const state = normalizeStateId(req.body?.state);
    const businessType = cleanText(req.body?.businessType);
    const limit = normalizeJobLimit(req.body?.limit);

    if (!state || !businessType || Number.isNaN(limit)) {
      res.status(400).json({
        ok: false,
        error:
          "state and businessType are required. limit must be a positive number or 'all'.",
      });
      return;
    }

    const stateConfig = getStateConfig(state);

    if (!stateConfig) {
      res.status(400).json({
        ok: false,
        error: `Unsupported state "${state}".`,
      });
      return;
    }

    const job = createJob({
      state,
      businessType,
      limit,
    });

    res.status(200).json({
      ok: true,
      message: "Job created.",
      jobId: job.jobId,
      job,
    });

    void runJobPipeline(job);
  } catch (error) {
    console.error("[routes] Failed to start job:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to start job.",
    });
  }
});

router.get("/api/job/status/:id", (req, res) => {
  try {
    console.log(`[routes] GET /api/job/status/${req.params.id}`);
    const job = getJob(req.params.id);

    res.status(200).json({
      ok: true,
      message: job ? "Job found." : "No job found yet. Stub route ready.",
      job,
    });
  } catch (error) {
    console.error("[routes] Failed to fetch job status:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch job status.",
    });
  }
});

router.get("/api/job/list", (req, res) => {
  try {
    console.log("[routes] GET /api/job/list");
    res.status(200).json({
      ok: true,
      jobs: listJobs(),
    });
  } catch (error) {
    console.error("[routes] Failed to list jobs:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to list jobs.",
    });
  }
});

router.post("/api/job/cancel/:id", (req, res) => {
  try {
    console.log(`[routes] POST /api/job/cancel/${req.params.id}`);
    const job = cancelJob(req.params.id);

    res.status(200).json({
      ok: true,
      message: job ? "Cancellation requested." : "No job found to cancel.",
      job,
    });
  } catch (error) {
    console.error("[routes] Failed to cancel job:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to cancel job.",
    });
  }
});

router.post("/api/job/pause/:id", (req, res) => {
  try {
    console.log(`[routes] POST /api/job/pause/${req.params.id}`);
    const job = pauseJob(req.params.id);

    res.status(200).json({
      ok: true,
      message: job ? "Pause requested." : "No job found to pause.",
      job,
    });
  } catch (error) {
    console.error("[routes] Failed to pause job:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to pause job.",
    });
  }
});

router.post("/api/job/resume/:id", (req, res) => {
  try {
    console.log(`[routes] POST /api/job/resume/${req.params.id}`);
    const job = resumeJob(req.params.id);

    res.status(200).json({
      ok: true,
      message: job ? "Resume requested." : "No job found to resume.",
      job,
    });
  } catch (error) {
    console.error("[routes] Failed to resume job:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to resume job.",
    });
  }
});

router.get("/api/results/:jobId", (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const filter = req.query.filter || "all";
    const job = getJob(req.params.jobId);

    console.log(
      `[routes] GET /api/results/${req.params.jobId} page=${page} limit=${limit} filter=${filter}`
    );

    const results = job?.results || [];
    const startIndex = (page - 1) * limit;
    const paginatedResults = results.slice(startIndex, startIndex + limit);

    res.status(200).json({
      ok: true,
      page,
      limit,
      filter,
      total: results.length,
      results: paginatedResults,
    });
  } catch (error) {
    console.error("[routes] Failed to fetch results:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch results.",
    });
  }
});

router.get("/api/export/:jobId", async (req, res) => {
  try {
    const jobId = cleanText(req.params.jobId);
    console.log(`[routes] GET /api/export/${jobId}`);

    const job = getJob(jobId);

    if (!job) {
      res.status(404).json({
        ok: false,
        error: `No job found for ${jobId}.`,
      });
      return;
    }

    if (!canExportJob(job)) {
      res.status(409).json({
        ok: false,
        error: `CSV export is only available after completion or cancellation. Current status: ${job.status}.`,
      });
      return;
    }

    const csvPath = await resolveCsvPath(job);

    if (!csvPath) {
      res.status(404).json({
        ok: false,
        error: `No CSV file is available for job ${jobId}.`,
      });
      return;
    }

    const downloadName = path.basename(csvPath);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`
    );

    const csvStream = fs.createReadStream(csvPath);
    csvStream.on("error", (error) => {
      console.error(
        `[routes] Failed while streaming CSV for job ${jobId}: ${error.message}`
      );

      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: "Failed to stream CSV export.",
        });
        return;
      }

      res.destroy(error);
    });

    csvStream.pipe(res);
  } catch (error) {
    console.error("[routes] Failed to prepare export:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to prepare export.",
    });
  }
});

router.post("/api/gmb-photo-scraper/job/start", (req, res) => {
  try {
    console.log("[routes] POST /api/gmb-photo-scraper/job/start");

    const keyword = cleanText(req.body?.keyword);
    const location = cleanText(req.body?.location);
    const listingsPerQuery = normalizePositiveIntegerRange(
      req.body?.listingsPerQuery,
      DEFAULT_LISTINGS_LIMIT,
      {
        min: 1,
        max: MAX_LISTINGS_LIMIT,
      }
    );
    const photosPerListing = normalizePositiveIntegerRange(
      req.body?.photosPerListing,
      DEFAULT_PHOTOS_LIMIT,
      {
        min: 1,
        max: MAX_PHOTOS_LIMIT,
      }
    );
    const tag = cleanText(req.body?.tag) || "all";

    if (
      !keyword ||
      !location ||
      Number.isNaN(listingsPerQuery) ||
      Number.isNaN(photosPerListing)
    ) {
      res.status(400).json({
        ok: false,
        error:
          "keyword and location are required. listingsPerQuery and photosPerListing must be positive numbers.",
      });
      return;
    }

    const job = createGmbPhotoJob({
      keyword,
      location,
      listingsPerQuery,
      photosPerListing,
      tag,
    });

    res.status(200).json({
      ok: true,
      message: "Background GMB photo job created.",
      jobId: job.jobId,
      job,
    });

    void runGmbPhotoJobPipeline(job);
  } catch (error) {
    console.error("[routes] Failed to start GMB photo job:", error.message);
    res.status(500).json({
      ok: false,
      error: cleanText(error.message) || "Failed to start GMB photo job.",
    });
  }
});

router.get("/api/gmb-photo-scraper/job/list", async (req, res) => {
  try {
    console.log("[routes] GET /api/gmb-photo-scraper/job/list");
    const jobs = listGmbPhotoJobs();

    await Promise.all(
      jobs
        .filter((job) => ["complete", "cancelled", "error"].includes(cleanText(job.status).toLowerCase()))
        .map(async (job) => {
          if (cleanText(job.csvPath) && cleanText(job.photosZipPath)) {
            return;
          }

          try {
            await ensureGmbPhotoArtifacts(job.jobId);
          } catch (artifactError) {
            console.error(`[routes] Failed to prepare GMB files for ${job.jobId}: ${artifactError.message}`);
          }
        })
    );

    res.status(200).json({
      ok: true,
      jobs: listGmbPhotoJobs().map((job) => summarizeGmbPhotoJob(job)),
    });
  } catch (error) {
    console.error("[routes] Failed to list GMB photo jobs:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to list GMB photo jobs.",
    });
  }
});

router.get("/api/gmb-photo-scraper/job/status/:id", async (req, res) => {
  try {
    console.log(`[routes] GET /api/gmb-photo-scraper/job/status/${req.params.id}`);
    let job = getGmbPhotoJob(req.params.id);

    if (job && ["complete", "cancelled", "error"].includes(cleanText(job.status).toLowerCase())) {
      try {
        await ensureGmbPhotoArtifacts(job.jobId);
        job = getGmbPhotoJob(req.params.id);
      } catch (artifactError) {
        console.error(`[routes] Failed to prepare files for GMB job ${req.params.id}: ${artifactError.message}`);
      }
    }

    res.status(200).json({
      ok: true,
      job,
    });
  } catch (error) {
    console.error("[routes] Failed to fetch GMB photo job status:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch GMB photo job status.",
    });
  }
});

router.post("/api/gmb-photo-scraper/job/cancel/:id", (req, res) => {
  try {
    console.log(`[routes] POST /api/gmb-photo-scraper/job/cancel/${req.params.id}`);
    const job = cancelGmbPhotoJob(req.params.id);

    res.status(200).json({
      ok: true,
      message: job ? "Cancellation requested." : "No job found to cancel.",
      job: job ? summarizeGmbPhotoJob(job) : null,
    });
  } catch (error) {
    console.error("[routes] Failed to cancel GMB photo job:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to cancel GMB photo job.",
    });
  }
});

router.post("/api/gmb-photo-scraper/job/pause/:id", (req, res) => {
  try {
    console.log(`[routes] POST /api/gmb-photo-scraper/job/pause/${req.params.id}`);
    const job = pauseGmbPhotoJob(req.params.id);

    res.status(200).json({
      ok: true,
      message: job ? "Pause requested." : "No job found to pause.",
      job: job ? summarizeGmbPhotoJob(job) : null,
    });
  } catch (error) {
    console.error("[routes] Failed to pause GMB photo job:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to pause GMB photo job.",
    });
  }
});

router.post("/api/gmb-photo-scraper/job/resume/:id", (req, res) => {
  try {
    console.log(`[routes] POST /api/gmb-photo-scraper/job/resume/${req.params.id}`);
    const job = resumeGmbPhotoJob(req.params.id);

    res.status(200).json({
      ok: true,
      message: job ? "Resume requested." : "No job found to resume.",
      job: job ? summarizeGmbPhotoJob(job) : null,
    });
  } catch (error) {
    console.error("[routes] Failed to resume GMB photo job:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to resume GMB photo job.",
    });
  }
});

router.get("/api/gmb-photo-scraper/job/export/:id", async (req, res) => {
  try {
    const job = getGmbPhotoJob(req.params.id);

    if (!job) {
      res.status(404).json({
        ok: false,
        error: `No background job found for ${req.params.id}.`,
      });
      return;
    }

    if (!["complete", "cancelled", "error"].includes(cleanText(job.status).toLowerCase())) {
      res.status(409).json({
        ok: false,
        error: `CSV export is only available after completion, cancellation, or failure. Current status: ${job.status}.`,
      });
      return;
    }

    const csvPath = await ensureGmbPhotoCsv(job.jobId);

    if (!csvPath || !fs.existsSync(csvPath)) {
      res.status(404).json({
        ok: false,
        error: `No CSV file is available for ${job.jobId}.`,
      });
      return;
    }

    const downloadName = path.basename(csvPath);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);

    const csvStream = fs.createReadStream(csvPath);
    csvStream.on("error", (error) => {
      console.error(`[routes] Failed while streaming GMB CSV for job ${job.jobId}: ${error.message}`);

      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: "Failed to stream GMB CSV export.",
        });
        return;
      }

      res.destroy(error);
    });

    csvStream.pipe(res);
  } catch (error) {
    console.error("[routes] Failed to export GMB photo job:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to export GMB photo job.",
    });
  }
});

router.get("/api/gmb-photo-scraper/job/photos/:id", async (req, res) => {
  try {
    const job = getGmbPhotoJob(req.params.id);

    if (!job) {
      res.status(404).json({
        ok: false,
        error: `No background job found for ${req.params.id}.`,
      });
      return;
    }

    const zipPath = await ensureGmbPhotoZip(job.jobId);
    if (!zipPath || !fs.existsSync(zipPath)) {
      res.status(404).json({
        ok: false,
        error: "No photo archive is available for this run yet.",
      });
      return;
    }

    const downloadName = path.basename(zipPath);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);

    const zipStream = fs.createReadStream(zipPath);
    zipStream.on("error", (error) => {
      console.error(`[routes] Failed while streaming GMB photo zip for job ${job.jobId}: ${error.message}`);

      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: "Failed to stream the photo archive.",
        });
        return;
      }

      res.destroy(error);
    });

    zipStream.pipe(res);
  } catch (error) {
    console.error("[routes] Failed to export GMB photo archive:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to export the saved photos.",
    });
  }
});

router.post("/api/gmb-photo-scraper/job/open-folder/:id", (req, res) => {
  try {
    const job = getGmbPhotoJob(req.params.id);

    if (!job) {
      res.status(404).json({
        ok: false,
        error: `No background job found for ${req.params.id}.`,
      });
      return;
    }

    const folderPathValue = cleanText(job.downloadSessionDir) || cleanText(job.downloadRootDir);
    if (!folderPathValue) {
      res.status(409).json({
        ok: false,
        error: "This run does not have a saved photo folder yet.",
      });
      return;
    }

    const resolvedFolderPath = path.resolve(folderPathValue);
    if (!isPathInsideAny(getAllowedDownloadRoots(), resolvedFolderPath) || !fs.existsSync(resolvedFolderPath)) {
      res.status(404).json({
        ok: false,
        error: "Saved photo folder was not found.",
      });
      return;
    }

    openFolderInExplorer(resolvedFolderPath);
    res.status(200).json({
      ok: true,
      folderPath: resolvedFolderPath,
    });
  } catch (error) {
    console.error("[routes] Failed to open GMB photo folder:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to open the saved photo folder.",
    });
  }
});

router.post("/api/gmb-photo-scraper/search", async (req, res) => {
  try {
    console.log("[routes] POST /api/gmb-photo-scraper/search");

    const keyword = cleanText(req.body?.keyword);
    const location = cleanText(req.body?.location);
    const listingsPerQuery = normalizePositiveIntegerRange(
      req.body?.listingsPerQuery,
      DEFAULT_LISTINGS_LIMIT,
      {
        min: 1,
        max: MAX_LISTINGS_LIMIT,
      }
    );

    if (!keyword || !location || Number.isNaN(listingsPerQuery)) {
      res.status(400).json({
        ok: false,
        error:
          "keyword and location are required. listingsPerQuery must be a positive number.",
      });
      return;
    }

    const result = await searchGmbListings({
      keyword,
      location,
      listingsPerQuery,
    });

    res.status(200).json({
      ok: true,
      message: `Found ${result.totalListings} unique Google Maps listings.`,
      ...result,
    });
  } catch (error) {
    console.error("[routes] Failed to search GMB listings:", error.message);
    res.status(500).json({
      ok: false,
      error: cleanText(error.message) || "Failed to search GMB listings.",
    });
  }
});

router.post("/api/gmb-photo-scraper/photos", async (req, res) => {
  try {
    console.log("[routes] POST /api/gmb-photo-scraper/photos");

    const keyword = cleanText(req.body?.keyword);
    const location = cleanText(req.body?.location);
    const listings = Array.isArray(req.body?.listings) ? req.body.listings : [];
    const photosPerListing = normalizePositiveIntegerRange(
      req.body?.photosPerListing,
      DEFAULT_PHOTOS_LIMIT,
      {
        min: 1,
        max: MAX_PHOTOS_LIMIT,
      }
    );
    const tag = cleanText(req.body?.tag) || "all";

    if (!listings.length || Number.isNaN(photosPerListing)) {
      res.status(400).json({
        ok: false,
        error:
          "listings are required. photosPerListing must be a positive number.",
      });
      return;
    }

    const result = await extractGmbListingPhotos({
      listings,
      photosPerListing,
      tag,
      keyword,
      location,
    });

    res.status(200).json({
      ok: true,
      message: `Extracted ${result.totalPhotos} photos across ${result.totalListings} listings.`,
      ...result,
    });
  } catch (error) {
    console.error("[routes] Failed to extract GMB photos:", error.message);
    res.status(500).json({
      ok: false,
      error: cleanText(error.message) || "Failed to extract GMB photos.",
    });
  }
});

router.get("/api/gmb-rank-tracker/history", async (req, res) => {
  try {
    const keyword = cleanText(req.query?.keyword);
    const location = cleanText(req.query?.location);

    if (!keyword || !location) {
      res.status(400).json({
        ok: false,
        error: "keyword and location are required.",
      });
      return;
    }

    const history = await listRankTrackerHistory(keyword, location);

    res.status(200).json({
      ok: true,
      keyword,
      location,
      snapshots: history,
    });
  } catch (error) {
    console.error("[routes] Failed to list rank tracker history:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to load rank tracker history.",
    });
  }
});

router.get("/api/settings/storage", async (req, res) => {
  try {
    const settings = await readStorageSettings();
    await ensureStorageDirectories(settings);

    res.status(200).json({
      ok: true,
      settings: serializeStorageSettings(settings),
    });
  } catch (error) {
    console.error("[routes] Failed to load storage settings:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to load storage settings.",
    });
  }
});

router.post("/api/settings/storage/pick-folder", async (req, res) => {
  try {
    const settings = await readStorageSettings();
    const selectedPath = await openFolderPicker(getStorageOpenPath(settings));

    res.status(200).json({
      ok: true,
      selected: Boolean(selectedPath),
      folderPath: selectedPath,
      settings: serializeStorageSettings(settings),
    });
  } catch (error) {
    console.error("[routes] Failed to open storage folder picker:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to open the folder picker.",
    });
  }
});

router.post("/api/settings/storage", async (req, res) => {
  try {
    const workspaceRoot = cleanText(req.body?.workspaceRoot);
    const settings = workspaceRoot
      ? await setStorageWorkspaceRoot(workspaceRoot)
      : await resetStorageWorkspaceRoot();

    await ensureStorageDirectories(settings);

    res.status(200).json({
      ok: true,
      message: workspaceRoot
        ? "New files will now save to your selected workspace folder."
        : "Storage has been reset to the app default folders.",
      settings: serializeStorageSettings(settings),
    });
  } catch (error) {
    console.error("[routes] Failed to save storage settings:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to save storage settings.",
    });
  }
});

router.post("/api/settings/storage/reset", async (req, res) => {
  try {
    const settings = await resetStorageWorkspaceRoot();
    await ensureStorageDirectories(settings);

    res.status(200).json({
      ok: true,
      message: "Storage has been reset to the app default folders.",
      settings: serializeStorageSettings(settings),
    });
  } catch (error) {
    console.error("[routes] Failed to reset storage settings:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to reset storage settings.",
    });
  }
});

router.post("/api/settings/storage/open-folder", async (req, res) => {
  try {
    const settings = await readStorageSettings();
    await ensureStorageDirectories(settings);
    const openPath = getStorageOpenPath(settings);

    if (!openPath) {
      res.status(404).json({
        ok: false,
        error: "No storage folder is available yet.",
      });
      return;
    }

    openFolderInExplorer(openPath);
    res.status(200).json({
      ok: true,
      folderPath: openPath,
      settings: serializeStorageSettings(settings),
    });
  } catch (error) {
    console.error("[routes] Failed to open the storage folder:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to open the storage folder.",
    });
  }
});

router.get("/api/states", (req, res) => {
  try {
    console.log("[routes] GET /api/states");
    res.status(200).json({
      ok: true,
      states,
    });
  } catch (error) {
    console.error("[routes] Failed to fetch states:", error.message);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch states.",
    });
  }
});

module.exports = router;






