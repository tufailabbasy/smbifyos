const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { GMB_JOBS_DIR } = require("./storage-paths");

const jobs = new Map();
const JOBS_DIR = GMB_JOBS_DIR;
const ACTIVE_JOB_STATUSES = new Set(["queued", "searching", "extracting_photos", "paused"]);
let persistQueue = Promise.resolve();

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizePositiveInteger(value, fallback = null) {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return Math.round(numericValue);
  }

  return fallback;
}

function normalizeLegacyErrorMessage(value = "") {
  const normalized = cleanText(value);

  if (/^[A-Z_]+_API_KEY is missing on the server\.?$/i.test(normalized)) {
    return "Legacy job from the old workflow. Re-run it to use the current direct browser scraper.";
  }

  return normalized;
}

function ensureJobsDirSync() {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

function getJobFilePath(jobId = "") {
  return path.join(JOBS_DIR, `gmb_photo_job_${cleanText(jobId)}.json`);
}

function createBaseJob({
  jobId = uuidv4(),
  keyword = "",
  location = "",
  listingsPerQuery = null,
  photosPerListing = null,
  tag = "all",
} = {}) {
  return {
    jobId: cleanText(jobId),
    keyword: cleanText(keyword),
    location: cleanText(location),
    listingsPerQuery: normalizePositiveInteger(listingsPerQuery),
    photosPerListing: normalizePositiveInteger(photosPerListing),
    tag: cleanText(tag) || "all",
    status: "queued",
    phase: "queued",
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalQueries: 0,
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
    queriesUsed: [],
    listings: [],
    photoItems: [],
    cancelRequested: false,
    pauseRequested: false,
    pausedAt: null,
    errorMessage: "",
    csvPath: "",
    photosZipPath: "",
  };
}

function normalizeLoadedJob(record = {}) {
  const baseJob = createBaseJob({
    jobId: record.jobId,
    keyword: record.keyword,
    location: record.location,
    listingsPerQuery: record.listingsPerQuery,
    photosPerListing: record.photosPerListing,
    tag: record.tag,
  });

  return {
    ...baseJob,
    ...record,
    jobId: cleanText(record.jobId || baseJob.jobId),
    keyword: cleanText(record.keyword || baseJob.keyword),
    location: cleanText(record.location || baseJob.location),
    listingsPerQuery: normalizePositiveInteger(record.listingsPerQuery, baseJob.listingsPerQuery),
    photosPerListing: normalizePositiveInteger(record.photosPerListing, baseJob.photosPerListing),
    tag: cleanText(record.tag || baseJob.tag) || "all",
    status: cleanText(record.status || baseJob.status) || "queued",
    phase: cleanText(record.phase || baseJob.phase) || "queued",
    startedAt: cleanText(record.startedAt || baseJob.startedAt) || new Date().toISOString(),
    completedAt: cleanText(record.completedAt) || null,
    totalQueries: normalizePositiveInteger(record.totalQueries, 0),
    processedQueries: normalizePositiveInteger(record.processedQueries, 0),
    totalListings: normalizePositiveInteger(record.totalListings, 0),
    processedListings: normalizePositiveInteger(record.processedListings, 0),
    totalPhotos: normalizePositiveInteger(record.totalPhotos, 0),
    downloadedPhotos: normalizePositiveInteger(record.downloadedPhotos, 0),
    downloadRootDir: cleanText(record.downloadRootDir),
    downloadSessionDir: cleanText(record.downloadSessionDir),
    serpQuery: cleanText(record.serpQuery),
    serpProvider: cleanText(record.serpProvider),
    serpResults: Array.isArray(record.serpResults) ? record.serpResults : [],
    rankSnapshotId: cleanText(record.rankSnapshotId),
    rankSnapshotPath: cleanText(record.rankSnapshotPath),
    snapshotCapturedAt: cleanText(record.snapshotCapturedAt),
    queriesUsed: Array.isArray(record.queriesUsed) ? record.queriesUsed : [],
    listings: Array.isArray(record.listings) ? record.listings : [],
    photoItems: Array.isArray(record.photoItems) ? record.photoItems : [],
    cancelRequested: Boolean(record.cancelRequested),
    pauseRequested: Boolean(record.pauseRequested),
    pausedAt: cleanText(record.pausedAt) || null,
    errorMessage: normalizeLegacyErrorMessage(record.errorMessage),
    csvPath: cleanText(record.csvPath),
    photosZipPath: cleanText(record.photosZipPath),
  };
}

function normalizeRestoredJob(job = {}) {
  const normalizedJob = normalizeLoadedJob(job);

  if (!ACTIVE_JOB_STATUSES.has(normalizedJob.status)) {
    return normalizedJob;
  }

  return {
    ...normalizedJob,
    status: "error",
    phase: "error",
    completedAt: normalizedJob.completedAt || new Date().toISOString(),
    cancelRequested: false,
    pauseRequested: false,
    pausedAt: null,
    errorMessage:
      cleanText(normalizedJob.errorMessage) ||
      "Local app restarted before this background job could finish.",
  };
}

function persistJobSync(job) {
  try {
    ensureJobsDirSync();
    fs.writeFileSync(
      getJobFilePath(job.jobId),
      `${JSON.stringify(job, null, 2)}\n`,
      "utf8"
    );
  } catch (error) {
    console.error(`[gmb-photo-job-manager] Failed to synchronously persist job ${job.jobId}: ${error.message}`);
  }
}

function queuePersistJob(job) {
  const normalizedJob = normalizeLoadedJob(job);

  persistQueue = persistQueue
    .catch(() => {})
    .then(async () => {
      try {
        await fsPromises.mkdir(JOBS_DIR, { recursive: true });
        await fsPromises.writeFile(
          getJobFilePath(normalizedJob.jobId),
          `${JSON.stringify(normalizedJob, null, 2)}\n`,
          "utf8"
        );
      } catch (error) {
        console.error(
          `[gmb-photo-job-manager] Failed to persist job ${normalizedJob.jobId}: ${error.message}`
        );
      }
    });
}

function loadJobsFromDisk() {
  try {
    ensureJobsDirSync();
    const fileNames = fs
      .readdirSync(JOBS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name);

    fileNames.forEach((fileName) => {
      try {
        const raw = fs.readFileSync(path.join(JOBS_DIR, fileName), "utf8");
        const parsed = JSON.parse(raw);
        const normalizedJob = normalizeRestoredJob(parsed);
        jobs.set(normalizedJob.jobId, normalizedJob);

        if (
          cleanText(parsed?.status).toLowerCase() !==
            cleanText(normalizedJob.status).toLowerCase() ||
          cleanText(parsed?.errorMessage) !== cleanText(normalizedJob.errorMessage)
        ) {
          persistJobSync(normalizedJob);
        }
      } catch (error) {
        console.error(
          `[gmb-photo-job-manager] Failed to load persisted job from ${fileName}: ${error.message}`
        );
      }
    });

    if (fileNames.length) {
      console.log(`[gmb-photo-job-manager] Restored ${fileNames.length} persisted GMB photo job(s).`);
    }
  } catch (error) {
    console.error(`[gmb-photo-job-manager] Failed to restore jobs from disk: ${error.message}`);
  }
}

function createGmbPhotoJob({
  keyword = "",
  location = "",
  listingsPerQuery = null,
  photosPerListing = null,
  tag = "all",
} = {}) {
  const job = createBaseJob({
    keyword,
    location,
    listingsPerQuery,
    photosPerListing,
    tag,
  });

  jobs.set(job.jobId, job);
  queuePersistJob(job);
  console.log(`[gmb-photo-job-manager] Created job ${job.jobId}`);
  return job;
}

function updateGmbPhotoJob(jobId, updates = {}) {
  const existingJob = jobs.get(jobId);

  if (!existingJob) {
    console.log(`[gmb-photo-job-manager] Cannot update missing job ${jobId}`);
    return null;
  }

  const updatedJob = normalizeLoadedJob({
    ...existingJob,
    ...updates,
  });

  jobs.set(jobId, updatedJob);
  queuePersistJob(updatedJob);
  return updatedJob;
}

function getGmbPhotoJob(jobId) {
  return jobs.get(jobId) || null;
}

function listGmbPhotoJobs() {
  return Array.from(jobs.values()).sort((left, right) => {
    return new Date(right.startedAt || 0).getTime() - new Date(left.startedAt || 0).getTime();
  });
}

function cancelGmbPhotoJob(jobId) {
  const existingJob = jobs.get(jobId);

  if (!existingJob) {
    console.log(`[gmb-photo-job-manager] Cannot cancel missing job ${jobId}`);
    return null;
  }

  if (["complete", "error", "cancelled"].includes(existingJob.status)) {
    return existingJob;
  }

  const cancelledJob = {
    ...existingJob,
    cancelRequested: true,
  };

  jobs.set(jobId, cancelledJob);
  queuePersistJob(cancelledJob);
  console.log(`[gmb-photo-job-manager] Cancellation requested for job ${jobId}`);
  return cancelledJob;
}

function pauseGmbPhotoJob(jobId) {
  const existingJob = jobs.get(jobId);

  if (!existingJob) {
    console.log(`[gmb-photo-job-manager] Cannot pause missing job ${jobId}`);
    return null;
  }

  if (["complete", "error", "cancelled"].includes(existingJob.status)) {
    return existingJob;
  }

  if (existingJob.pauseRequested || existingJob.status === "paused") {
    return existingJob;
  }

  const pausedJob = {
    ...existingJob,
    pauseRequested: true,
    phase:
      existingJob.status === "paused"
        ? existingJob.phase || "queued"
        : existingJob.status || existingJob.phase || "queued",
    status: "paused",
    pausedAt: new Date().toISOString(),
  };

  jobs.set(jobId, pausedJob);
  queuePersistJob(pausedJob);
  console.log(`[gmb-photo-job-manager] Pause requested for job ${jobId}`);
  return pausedJob;
}

function resumeGmbPhotoJob(jobId) {
  const existingJob = jobs.get(jobId);

  if (!existingJob) {
    console.log(`[gmb-photo-job-manager] Cannot resume missing job ${jobId}`);
    return null;
  }

  if (["complete", "error", "cancelled"].includes(existingJob.status)) {
    return existingJob;
  }

  const resumedStatus =
    existingJob.phase &&
    !["paused", "complete", "error", "cancelled"].includes(existingJob.phase)
      ? existingJob.phase
      : "queued";

  const resumedJob = {
    ...existingJob,
    pauseRequested: false,
    pausedAt: null,
    status: resumedStatus,
  };

  jobs.set(jobId, resumedJob);
  queuePersistJob(resumedJob);
  console.log(`[gmb-photo-job-manager] Resume requested for job ${jobId}`);
  return resumedJob;
}

loadJobsFromDisk();

module.exports = {
  createGmbPhotoJob,
  updateGmbPhotoJob,
  getGmbPhotoJob,
  listGmbPhotoJobs,
  cancelGmbPhotoJob,
  pauseGmbPhotoJob,
  resumeGmbPhotoJob,
  JOBS_DIR,
};
