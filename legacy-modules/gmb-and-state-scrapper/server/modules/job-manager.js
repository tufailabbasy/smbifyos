const { v4: uuidv4 } = require("uuid");

const jobs = new Map();

function normalizeJobLimit(limit) {
  const numericLimit = Number(limit);

  if (Number.isFinite(numericLimit) && numericLimit > 0) {
    return numericLimit;
  }

  return null;
}

function createJob({ state = "", businessType = "", limit = null } = {}) {
  const job = {
    jobId: uuidv4(),
    state,
    businessType,
    limit: normalizeJobLimit(limit),
    status: "running",
    phase: "running",
    scraped: 0,
    gmbChecked: 0,
    total: 0,
    noGMB: 0,
    hasGMB: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    results: [],
    cancelRequested: false,
    pauseRequested: false,
    pausedAt: null,
    rawDataPath: "",
    resultsPath: "",
    csvPath: "",
    errorMessage: "",
  };

  jobs.set(job.jobId, job);
  console.log(`[job-manager] Created job ${job.jobId}`);
  return job;
}

function updateJob(jobId, updates = {}) {
  const existingJob = jobs.get(jobId);

  if (!existingJob) {
    console.log(`[job-manager] Cannot update missing job ${jobId}`);
    return null;
  }

  const updatedJob = {
    ...existingJob,
    ...updates,
  };

  jobs.set(jobId, updatedJob);
  return updatedJob;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function listJobs() {
  return Array.from(jobs.values()).sort((a, b) => {
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
}

function cancelJob(jobId) {
  const existingJob = jobs.get(jobId);

  if (!existingJob) {
    console.log(`[job-manager] Cannot cancel missing job ${jobId}`);
    return null;
  }

  if (["complete", "error", "cancelled"].includes(existingJob.status)) {
    console.log(
      `[job-manager] Job ${jobId} is already in terminal status ${existingJob.status}`
    );
    return existingJob;
  }

  const cancelledJob = {
    ...existingJob,
    cancelRequested: true,
  };

  jobs.set(jobId, cancelledJob);
  console.log(`[job-manager] Cancellation requested for job ${jobId}`);
  return cancelledJob;
}

function pauseJob(jobId) {
  const existingJob = jobs.get(jobId);

  if (!existingJob) {
    console.log(`[job-manager] Cannot pause missing job ${jobId}`);
    return null;
  }

  if (["complete", "error", "cancelled"].includes(existingJob.status)) {
    console.log(
      `[job-manager] Job ${jobId} is already in terminal status ${existingJob.status}`
    );
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
        ? existingJob.phase || "running"
        : existingJob.status || existingJob.phase || "running",
    status: "paused",
    pausedAt: new Date().toISOString(),
  };

  jobs.set(jobId, pausedJob);
  console.log(`[job-manager] Pause requested for job ${jobId}`);
  return pausedJob;
}

function resumeJob(jobId) {
  const existingJob = jobs.get(jobId);

  if (!existingJob) {
    console.log(`[job-manager] Cannot resume missing job ${jobId}`);
    return null;
  }

  if (["complete", "error", "cancelled"].includes(existingJob.status)) {
    console.log(
      `[job-manager] Job ${jobId} is already in terminal status ${existingJob.status}`
    );
    return existingJob;
  }

  const resumedStatus =
    existingJob.phase &&
    !["paused", "complete", "error", "cancelled"].includes(existingJob.phase)
      ? existingJob.phase
      : "running";

  const resumedJob = {
    ...existingJob,
    pauseRequested: false,
    pausedAt: null,
    status: resumedStatus,
  };

  jobs.set(jobId, resumedJob);
  console.log(`[job-manager] Resume requested for job ${jobId}`);
  return resumedJob;
}

module.exports = {
  createJob,
  updateJob,
  getJob,
  listJobs,
  cancelJob,
  pauseJob,
  resumeJob,
};
