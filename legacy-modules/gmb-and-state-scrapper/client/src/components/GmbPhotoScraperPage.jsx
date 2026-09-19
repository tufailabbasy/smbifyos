import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CameraIcon,
  ClipboardListIcon,
  DownloadIcon,
  LinkIcon,
  MapPinIcon,
  PauseIcon,
  RefreshIcon,
  SearchIcon,
  StopIcon,
  TargetIcon,
  XCircleIcon,
} from "./Icons";

const DEFAULT_LISTINGS_PER_QUERY = 120;
const DEFAULT_PHOTOS_PER_LISTING = 20;
const JOB_REFRESH_MS = 3000;
const ACTIVE_JOB_STATUSES = new Set(["queued", "searching", "extracting_photos", "paused"]);
const TERMINAL_JOB_STATUSES = new Set(["complete", "cancelled", "error"]);

function cleanMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;
}

async function readDownloadError(error, fallback) {
  const blob = error?.response?.data;
  if (blob instanceof Blob) {
    try {
      const text = await blob.text();
      if (text) {
        const parsed = JSON.parse(text);
        return parsed?.error || parsed?.message || fallback;
      }
    } catch {
      try {
        const text = await blob.text();
        if (text) return text;
      } catch {
        return fallback;
      }
    }
  }

  return cleanMessage(error, fallback);
}

function filenameFromDisposition(disposition, fallbackName) {
  const value = String(disposition || "");
  const utfMatch = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const plainMatch = value.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plainMatch?.[1] || fallbackName;
}

function statusLabel(status = "") {
  const value = String(status || "").toLowerCase();
  if (value === "searching") return "Finding Listings";
  if (value === "extracting_photos") return "Saving Photos";
  if (value === "cancelled") return "Stopped";
  if (value === "complete") return "Complete";
  if (value === "error") return "Error";
  if (value === "paused") return "Paused";
  if (value === "queued") return "Queued";
  return value || "Pending";
}

function badgeClass(status = "") {
  const value = String(status || "").toLowerCase();
  if (value === "complete") return "badge badge-active";
  if (value === "cancelled") return "badge badge-warning";
  if (value === "error") return "badge badge-error";
  return "badge badge-brand";
}

function progressWidth(current, total, status = "") {
  if (!total) {
    return String(status || "").toLowerCase() === "complete" ? "100%" : Number(current || 0) > 0 ? "45%" : "0%";
  }
  return `${Math.min(100, Math.round((Number(current || 0) / Number(total || 1)) * 100))}%`;
}

function shortJobId(jobId = "") {
  return jobId ? `${jobId.slice(0, 8)}...${jobId.slice(-4)}` : "-";
}

function sortJobs(items = []) {
  return [...items].sort((left, right) => new Date(right.startedAt || 0).getTime() - new Date(left.startedAt || 0).getTime());
}

function formatTimestamp(value = "") {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function emptyPreview() {
  return {
    keyword: "",
    location: "",
    queriesUsed: [],
    totalListings: 0,
    listings: [],
    items: [],
    downloadedPhotos: 0,
    downloadSessionDir: "",
  };
}

export default function GmbPhotoScraperPage() {
  const [formValues, setFormValues] = useState({
    keyword: "",
    location: "",
    listingsPerQuery: String(DEFAULT_LISTINGS_PER_QUERY),
    photosPerListing: String(DEFAULT_PHOTOS_PER_LISTING),
  });
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJobDetail, setSelectedJobDetail] = useState(null);
  const [selectedJobError, setSelectedJobError] = useState("");
  const [jobActionId, setJobActionId] = useState("");
  const [folderActionId, setFolderActionId] = useState("");
  const [downloadActionKey, setDownloadActionKey] = useState("");
  const [startingRun, setStartingRun] = useState(false);
  const jobsRef = useRef(null);
  const detailRef = useRef(null);

  function updateField(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchJobs() {
      try {
        if (!cancelled && !jobs.length) setJobsLoading(true);
        const response = await axios.get("/api/gmb-photo-scraper/job/list");
        const nextJobs = sortJobs(Array.isArray(response.data?.jobs) ? response.data.jobs : []);
        if (cancelled) return;
        setJobs(nextJobs);
        setJobsError("");
        setSelectedJobId((current) => (current && nextJobs.some((job) => job.jobId === current) ? current : nextJobs[0]?.jobId || ""));
      } catch (error) {
        if (!cancelled) setJobsError(cleanMessage(error, "Unable to load saved runs."));
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    }

    fetchJobs();
    const intervalId = window.setInterval(fetchJobs, JOB_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [jobs.length]);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJobDetail(null);
      setSelectedJobError("");
      return;
    }

    let cancelled = false;
    let intervalId = null;

    async function fetchJob() {
      try {
        const response = await axios.get(`/api/gmb-photo-scraper/job/status/${selectedJobId}`);
        if (cancelled) return;
        setSelectedJobDetail(response.data?.job || null);
        setSelectedJobError("");
      } catch (error) {
        if (!cancelled) setSelectedJobError(cleanMessage(error, "Unable to load the selected run."));
      }
    }

    fetchJob();
    const selectedJob = jobs.find((job) => job.jobId === selectedJobId);
    if (selectedJob && ACTIVE_JOB_STATUSES.has(selectedJob.status)) {
      intervalId = window.setInterval(fetchJob, JOB_REFRESH_MS);
    }

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [selectedJobId, jobs]);

  async function handleStartRun(event) {
    event.preventDefault();

    try {
      setStartingRun(true);
      setJobsError("");
      const response = await axios.post("/api/gmb-photo-scraper/job/start", {
        keyword: formValues.keyword,
        location: formValues.location,
        listingsPerQuery: Number(formValues.listingsPerQuery) || DEFAULT_LISTINGS_PER_QUERY,
        photosPerListing: Number(formValues.photosPerListing) || DEFAULT_PHOTOS_PER_LISTING,
      });
      const nextJob = response.data?.job;
      const nextJobId = response.data?.jobId || nextJob?.jobId;
      if (nextJob) setJobs((current) => sortJobs([nextJob, ...current]));
      if (nextJobId) setSelectedJobId(nextJobId);
      window.setTimeout(() => jobsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    } catch (error) {
      setJobsError(cleanMessage(error, "Unable to start the run."));
    } finally {
      setStartingRun(false);
    }
  }

  async function handleJobAction(jobId, action) {
    try {
      setJobActionId(jobId);
      const response = await axios.post(`/api/gmb-photo-scraper/job/${action}/${jobId}`);
      const nextJob = response.data?.job;
      if (nextJob) {
        setJobs((current) => sortJobs(current.map((job) => (job.jobId === jobId ? { ...job, ...nextJob } : job))));
      }
    } catch (error) {
      setJobsError(cleanMessage(error, `Unable to ${action} this run.`));
    } finally {
      setJobActionId("");
    }
  }

  async function handleOpenJobFolder(jobId) {
    try {
      setFolderActionId(jobId);
      await axios.post(`/api/gmb-photo-scraper/job/open-folder/${jobId}`);
      setJobsError("");
    } catch (error) {
      setJobsError(cleanMessage(error, "Unable to open the saved photo folder."));
    } finally {
      setFolderActionId("");
    }
  }

  async function downloadFile(url, fallbackName, actionKey, fallbackError) {
    try {
      setDownloadActionKey(actionKey);
      setJobsError("");
      const response = await axios.get(url, { responseType: "blob" });
      const fileName = filenameFromDisposition(response.headers?.["content-disposition"], fallbackName);
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      setJobsError(await readDownloadError(error, fallbackError));
    } finally {
      setDownloadActionKey("");
    }
  }

  function handleExport(jobId) {
    return downloadFile(`/api/gmb-photo-scraper/job/export/${jobId}`, `${jobId}-listings.csv`, `csv:${jobId}`, "Unable to download the listing CSV.");
  }

  function handleDownloadPhotos(jobId) {
    return downloadFile(`/api/gmb-photo-scraper/job/photos/${jobId}`, `${jobId}-photos.zip`, `photos:${jobId}`, "Unable to download the saved photos.");
  }

  const preview = selectedJobDetail
    ? {
        keyword: selectedJobDetail.keyword || "",
        location: selectedJobDetail.location || "",
        queriesUsed: Array.isArray(selectedJobDetail.queriesUsed) ? selectedJobDetail.queriesUsed : [],
        totalListings: Number(selectedJobDetail.totalListings) || 0,
        listings: Array.isArray(selectedJobDetail.listings) ? selectedJobDetail.listings : [],
        items: Array.isArray(selectedJobDetail.photoItems) ? selectedJobDetail.photoItems : [],
        downloadedPhotos: Number(selectedJobDetail.downloadedPhotos) || 0,
        downloadSessionDir: selectedJobDetail.downloadSessionDir || "",
      }
    : emptyPreview();

  const activeJobs = useMemo(() => jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)), [jobs]);
  const stoppedJobs = useMemo(() => jobs.filter((job) => job.status === "cancelled"), [jobs]);
  const finishedJobs = useMemo(() => jobs.filter((job) => ["complete", "error"].includes(job.status)), [jobs]);
  const photoItems = useMemo(() => preview.items.filter((item) => Array.isArray(item.photos) && item.photos.length), [preview.items]);
  const highPriorityLeadCount = useMemo(() => preview.items.filter((item) => Number(item.leadScore || 0) >= 70).length, [preview.items]);
  const selectedJobSummary = jobs.find((job) => job.jobId === selectedJobId) || null;
  const selectedStatus = selectedJobSummary?.status || selectedJobDetail?.status || "";
  const canOpenSelectedFolder = Boolean(selectedJobId && (selectedJobDetail?.downloadSessionDir || selectedJobDetail?.downloadRootDir));
  const selectedPhotoCount = Number(selectedJobDetail?.downloadedPhotos || selectedJobSummary?.downloadedPhotos || 0);
  const canDownloadSelectedPhotos = Boolean(selectedJobId && (selectedJobDetail?.photosZipPath || selectedJobSummary?.photosZipPath || selectedPhotoCount > 0));
  const canDownloadSelectedCsv = Boolean(selectedJobId && (selectedJobDetail?.csvPath || selectedJobSummary?.csvPath || TERMINAL_JOB_STATUSES.has(selectedStatus)));

  function renderJobGroup(title, description, items, emptyCopy) {
    return (
      <div className="page-stack" style={{ gap: "16px" }}>
        <div className="header-row">
          <div>
            <p className="section-label">{title}</p>
            <p className="section-copy">{description}</p>
          </div>
          <span className="badge badge-brand">{items.length}</span>
        </div>

        {!items.length ? <div className="empty-state">{emptyCopy}</div> : <div className="job-list">
          {items.map((job) => {
            const canPause = ["queued", "searching", "extracting_photos"].includes(job.status);
            const canResume = job.status === "paused";
            const isStopping = Boolean(job.cancelRequested) && job.status !== "cancelled";
            const canCancel = (canPause || canResume) && !isStopping;
            const canDownload = Boolean(job.csvPath || TERMINAL_JOB_STATUSES.has(job.status));
            const canOpenFolder = Boolean(job.downloadSessionDir || job.downloadRootDir);
            const canDownloadPhotos = Boolean(job.photosZipPath || Number(job.downloadedPhotos || 0) > 0);
            const csvDownloadBusy = downloadActionKey === `csv:${job.jobId}`;
            const photoDownloadBusy = downloadActionKey === `photos:${job.jobId}`;

            return (
              <article key={job.jobId} className={`job-card${selectedJobId === job.jobId ? " is-selected" : ""}`}>
                <button
                  className="job-card-main"
                  onClick={() => {
                    setSelectedJobId(job.jobId);
                    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
                  }}
                  type="button"
                >
                  <div className="job-header">
                    <div className="job-title-row">
                      <div>
                        <p className="section-label">Saved Run</p>
                        <h3 className="job-title">{job.keyword} / {job.location}</h3>
                        <p className="job-meta mono-text">Job ID {shortJobId(job.jobId)}</p>
                      </div>
                      <span className={badgeClass(job.status)}>{statusLabel(job.status)}</span>
                    </div>

                    <div className="progress-grid">
                      <div className="progress-group">
                        <div className="progress-meta">
                          <span>Searches checked</span>
                          <strong>{Number(job.processedQueries || 0)}/{Number(job.totalQueries || 0)}</strong>
                        </div>
                        <div className="progress-track">
                          <div className="progress-bar scrape" style={{ width: progressWidth(job.processedQueries, job.totalQueries, job.status) }} />
                        </div>
                      </div>

                      <div className="progress-group">
                        <div className="progress-meta">
                          <span>Listings finished</span>
                          <strong>{Number(job.processedListings || 0)}/{Number(job.totalListings || 0)}</strong>
                        </div>
                        <div className="progress-track">
                          <div className="progress-bar gmb" style={{ width: progressWidth(job.processedListings, job.totalListings, job.status) }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                <div className="header-row" style={{ marginTop: "18px" }}>
                  <div className="stats-inline">
                    <span className="stats-chip"><ClipboardListIcon className="icon icon-sm" /> Target {Number(job.listingsPerQuery || 0)}</span>
                    <span className="stats-chip"><CameraIcon className="icon icon-sm" /> Saved {Number(job.downloadedPhotos || 0)}</span>
                    <span className="stats-chip"><TargetIcon className="icon icon-sm" /> Photos each {Number(job.photosPerListing || 0)}</span>
                  </div>

                  <div className="action-row">
                    <button className="btn btn-secondary btn-sm" disabled={!canPause || jobActionId === job.jobId} onClick={() => handleJobAction(job.jobId, "pause")} type="button">
                      <PauseIcon className="icon icon-sm" />
                      {jobActionId === job.jobId && canPause ? "Pausing..." : "Pause"}
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={!canResume || jobActionId === job.jobId} onClick={() => handleJobAction(job.jobId, "resume")} type="button">
                      <RefreshIcon className="icon icon-sm" />
                      {jobActionId === job.jobId && canResume ? "Resuming..." : "Resume"}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={!canCancel || jobActionId === job.jobId} onClick={() => handleJobAction(job.jobId, "cancel")} type="button">
                      <StopIcon className="icon icon-sm" />
                      {jobActionId === job.jobId || isStopping ? "Stopping..." : "Stop"}
                    </button>
                    <button className="btn btn-secondary btn-sm" disabled={!canOpenFolder || folderActionId === job.jobId} onClick={() => handleOpenJobFolder(job.jobId)} type="button">
                      <LinkIcon className="icon icon-sm" />
                      {folderActionId === job.jobId ? "Opening..." : "Open Folder"}
                    </button>
                    <button className="btn btn-secondary btn-sm" disabled={!canDownloadPhotos || photoDownloadBusy} onClick={() => handleDownloadPhotos(job.jobId)} type="button">
                      <DownloadIcon className="icon icon-sm" />
                      {photoDownloadBusy ? "Preparing ZIP..." : "Download Photos ZIP"}
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={!canDownload || csvDownloadBusy} onClick={() => handleExport(job.jobId)} type="button">
                      <DownloadIcon className="icon icon-sm" />
                      {csvDownloadBusy ? "Preparing CSV..." : "Download Listing CSV"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-grid">
          <div>
            <span className="hero-eyebrow"><CameraIcon className="icon icon-sm" /> Google Maps Photo Workspace</span>
            <h1 className="hero-title">One simple run: find listings, save photos, and keep every query in history.</h1>
            <p className="hero-copy">Photos are saved as actual image files. Stopped and finished runs stay available with ready-to-download CSVs.</p>
          </div>

          <div className="metric-grid">
            <div className="stat-card"><div className="stat-header"><span className="stat-label">Active Runs</span><ActivityIcon className="icon icon-lg" /></div><div className="stat-value">{activeJobs.length}</div><div className="stat-change">Runs still working</div></div>
            <div className="stat-card"><div className="stat-header"><span className="stat-label">Found Listings</span><ClipboardListIcon className="icon icon-lg" /></div><div className="stat-value">{preview.totalListings}</div><div className="stat-change">From selected run</div></div>
            <div className="stat-card"><div className="stat-header"><span className="stat-label">Saved Photos</span><CameraIcon className="icon icon-lg" /></div><div className="stat-value">{preview.downloadedPhotos}</div><div className="stat-change">Actual files on disk</div></div>
            <div className="stat-card"><div className="stat-header"><span className="stat-label">Selected Run</span><TargetIcon className="icon icon-lg" /></div><div className="stat-value">{selectedJobSummary ? statusLabel(selectedJobSummary.status) : "-"}</div><div className="stat-change">{selectedJobSummary ? shortJobId(selectedJobSummary.jobId) : "Pick a run"}</div></div>
          </div>
        </div>
      </section>

      <section className="panel-card">
        <div className="card-header">
          <div className="header-title">
            <span className="header-icon-shell"><SearchIcon className="icon icon-lg" /></span>
            <div>
              <p className="section-label">Start Run</p>
              <h2 className="section-title">Find listings and save photos</h2>
            </div>
          </div>
          <p className="section-copy">Enter keyword and location once, then let the app handle search, enrichment, download, and history.</p>
        </div>

        <form className="form-grid" onSubmit={handleStartRun}>
          <div className="field-group">
            <label className="field-label" htmlFor="gmb-keyword"><SearchIcon className="icon icon-md" /> Keyword</label>
            <div className="field-control"><SearchIcon className="field-icon icon icon-md" /><input className="input-field with-icon" id="gmb-keyword" placeholder="e.g. plumbers" type="text" value={formValues.keyword} onChange={(event) => updateField("keyword", event.target.value)} /></div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="gmb-location"><MapPinIcon className="icon icon-md" /> Location</label>
            <div className="field-control"><MapPinIcon className="field-icon icon icon-md" /><input className="input-field with-icon" id="gmb-location" placeholder="e.g. New York, NY" type="text" value={formValues.location} onChange={(event) => updateField("location", event.target.value)} /></div>
          </div>

          <div className="field-row">
            <div className="field-group">
              <label className="field-label" htmlFor="listings-per-query"><ClipboardListIcon className="icon icon-md" /> How many listings should we find?</label>
              <div className="field-control"><ClipboardListIcon className="field-icon icon icon-md" /><input className="input-field with-icon" id="listings-per-query" min="1" max="400" type="number" value={formValues.listingsPerQuery} onChange={(event) => updateField("listingsPerQuery", event.target.value)} /></div>
              <p className="table-subcopy">The app tries related searches and stops after this many unique listings.</p>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="photos-per-listing"><CameraIcon className="icon icon-md" /> How many photos should we save per listing?</label>
              <div className="field-control"><CameraIcon className="field-icon icon icon-md" /><input className="input-field with-icon" id="photos-per-listing" min="1" max="500" type="number" value={formValues.photosPerListing} onChange={(event) => updateField("photosPerListing", event.target.value)} /></div>
              <p className="table-subcopy">These are actual downloaded images, not only links.</p>
            </div>
          </div>

          <div className="alert alert-info"><DownloadIcon className="icon icon-md" /><div>Use <strong>Open Folder</strong> or <strong>Download Photos ZIP</strong> after the run starts. If you stop a run, it moves to <strong>Stopped Runs</strong> and its listing CSV stays downloadable.</div></div>

          <div className="action-row">
            <button className="btn btn-primary btn-lg" disabled={startingRun || !formValues.keyword.trim() || !formValues.location.trim()} type="submit"><ActivityIcon className="icon icon-md" /> {startingRun ? "Starting..." : "Start Run"}</button>
            <button className="btn btn-secondary btn-lg" disabled={!canOpenSelectedFolder || selectedJobId && folderActionId === selectedJobId} onClick={() => selectedJobId && handleOpenJobFolder(selectedJobId)} type="button"><LinkIcon className="icon icon-md" /> {selectedJobId && folderActionId === selectedJobId ? "Opening..." : "Open Selected Folder"}</button>
            <button className="btn btn-secondary btn-lg" disabled={!canDownloadSelectedPhotos || downloadActionKey === `photos:${selectedJobId}`} onClick={() => selectedJobId && handleDownloadPhotos(selectedJobId)} type="button"><DownloadIcon className="icon icon-md" /> {downloadActionKey === `photos:${selectedJobId}` ? "Preparing ZIP..." : "Download Photos ZIP"}</button>
            <button className="btn btn-secondary btn-lg" disabled={!canDownloadSelectedCsv || downloadActionKey === `csv:${selectedJobId}`} onClick={() => selectedJobId && handleExport(selectedJobId)} type="button"><DownloadIcon className="icon icon-md" /> {downloadActionKey === `csv:${selectedJobId}` ? "Preparing CSV..." : "Download Listing CSV"}</button>
          </div>
        </form>
      </section>

      <section className="panel-card" ref={jobsRef}>
        <div className="card-header">
          <div className="header-row">
            <div className="header-title"><span className="header-icon-shell"><ActivityIcon className="icon icon-lg" /></span><div><p className="section-label">Runs and History</p><h2 className="section-title">Every query stays visible here</h2></div></div>
            <span className="badge badge-brand">{jobs.length} total</span>
          </div>
        </div>

        {jobsError ? <div className="alert alert-danger" style={{ marginBottom: "18px" }}><AlertTriangleIcon className="icon icon-md" /><div>{jobsError}</div></div> : null}
        {selectedJobError ? <div className="alert alert-danger" style={{ marginBottom: "18px" }}><AlertTriangleIcon className="icon icon-md" /><div>{selectedJobError}</div></div> : null}
        {jobsLoading && !jobs.length ? <div className="empty-state">Loading saved runs...</div> : null}
        {!jobsLoading && !jobs.length ? <div className="empty-state">No runs yet. Start your first one above.</div> : null}

        {jobs.length ? <div className="page-stack" style={{ gap: "28px" }}>
          {renderJobGroup("Active Runs", "Runs that are still working or paused.", activeJobs, "No active runs right now.")}
          {renderJobGroup("Stopped Runs", "Runs you stopped manually.", stoppedJobs, "No stopped runs yet.")}
          {renderJobGroup("Finished Runs", "Completed runs and runs that ended with an error.", finishedJobs, "No finished runs yet.")}
        </div> : null}
      </section>

      <section className="panel-card" ref={detailRef}>
        <div className="card-header">
          <div className="header-row">
            <div className="header-title"><span className="header-icon-shell"><TargetIcon className="icon icon-lg" /></span><div><p className="section-label">Selected Run</p><h2 className="section-title">Current run details</h2></div></div>
            {selectedJobSummary ? <span className={badgeClass(selectedJobSummary.status)}>{statusLabel(selectedJobSummary.status)}</span> : null}
          </div>
        </div>

        {!selectedJobDetail ? <div className="empty-state">Pick a run above to see its listings, photos, and save folder.</div> : <div className="page-stack" style={{ gap: "18px" }}>
          <div className="header-row">
            <div><h3 className="job-title">{selectedJobDetail.keyword} / {selectedJobDetail.location}</h3><p className="job-meta mono-text">Job ID {shortJobId(selectedJobDetail.jobId)}</p></div>
            <div className="action-row">
              <button className="btn btn-secondary btn-sm" disabled={!canOpenSelectedFolder || selectedJobId && folderActionId === selectedJobId} onClick={() => selectedJobId && handleOpenJobFolder(selectedJobId)} type="button"><LinkIcon className="icon icon-sm" /> {selectedJobId && folderActionId === selectedJobId ? "Opening..." : "Open Folder"}</button>
              <button className="btn btn-secondary btn-sm" disabled={!canDownloadSelectedPhotos || downloadActionKey === `photos:${selectedJobId}`} onClick={() => selectedJobId && handleDownloadPhotos(selectedJobId)} type="button"><DownloadIcon className="icon icon-sm" /> {downloadActionKey === `photos:${selectedJobId}` ? "Preparing ZIP..." : "Download Photos ZIP"}</button>
              <button className="btn btn-primary btn-sm" disabled={!canDownloadSelectedCsv || downloadActionKey === `csv:${selectedJobId}`} onClick={() => selectedJobId && handleExport(selectedJobId)} type="button"><DownloadIcon className="icon icon-sm" /> {downloadActionKey === `csv:${selectedJobId}` ? "Preparing CSV..." : "Download Listing CSV"}</button>
            </div>
          </div>

          {selectedJobDetail.errorMessage ? <div className="alert alert-danger"><XCircleIcon className="icon icon-md" /><div>{selectedJobDetail.errorMessage}</div></div> : null}
          {selectedJobDetail.downloadSessionDir ? <div className="alert alert-info"><DownloadIcon className="icon icon-md" /><div>Photos are saved here as real image files:<span className="mono-text"> {selectedJobDetail.downloadSessionDir}</span></div></div> : null}

          <div className="stats-inline">
            <span className="stats-chip"><ClipboardListIcon className="icon icon-sm" /> Listings {Number(selectedJobDetail.totalListings || 0)}</span>
            <span className="stats-chip"><CameraIcon className="icon icon-sm" /> Photos {Number(selectedJobDetail.downloadedPhotos || 0)}</span>
            <span className="stats-chip"><SearchIcon className="icon icon-sm" /> Searches {Number(selectedJobDetail.totalQueries || 0)}</span>
            <span className="stats-chip"><TargetIcon className="icon icon-sm" /> Started {formatTimestamp(selectedJobDetail.startedAt)}</span>
          </div>

          {preview.queriesUsed.length ? <div className="chip-row">{preview.queriesUsed.map((query) => <span key={query} className="query-chip">{query}</span>)}</div> : null}
        </div>}
      </section>

      <section className="panel-card">
        <div className="card-header">
          <div className="header-title"><span className="header-icon-shell"><ClipboardListIcon className="icon icon-lg" /></span><div><p className="section-label">Listings Found</p><h2 className="section-title">Businesses from the selected run</h2></div></div>
          <p className="section-copy">{preview.keyword && preview.location ? `Keyword: ${preview.keyword} · Location: ${preview.location}` : "Start a run, then pick it from history to see listings here."}</p>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Rank</th><th>Business</th><th>Category</th><th>Address</th><th>Phone</th><th>Website</th><th>Reviews</th><th>Maps</th></tr></thead>
            <tbody>
              {!preview.listings.length ? <tr><td colSpan={8}>No listings loaded yet.</td></tr> : preview.listings.map((listing, index) => (
                <tr key={`${listing.listingId || listing.name || "listing"}-${index}`}>
                  <td>{listing.bestRank || "-"}</td>
                  <td><strong>{listing.name || "Unknown listing"}</strong></td>
                  <td>{listing.category || "-"}</td>
                  <td>{listing.address || "-"}</td>
                  <td>{listing.phone || "-"}</td>
                  <td>{listing.website ? <a className="table-link" href={listing.website} rel="noreferrer" target="_blank"><LinkIcon className="icon icon-sm" /> {listing.websiteDomain || "Open"}</a> : "-"}</td>
                  <td>{listing.reviews || "-"}</td>
                  <td>{listing.locationLink ? <a className="table-link" href={listing.locationLink} rel="noreferrer" target="_blank"><LinkIcon className="icon icon-sm" /> Open</a> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel-card">
        <div className="card-header">
          <div className="header-row">
            <div className="header-title"><span className="header-icon-shell"><CameraIcon className="icon icon-lg" /></span><div><p className="section-label">Saved Photos</p><h2 className="section-title">Downloaded photo preview</h2></div></div>
            <div className="action-row">
              <button className="btn btn-secondary btn-sm" disabled={!canOpenSelectedFolder || selectedJobId && folderActionId === selectedJobId} onClick={() => selectedJobId && handleOpenJobFolder(selectedJobId)} type="button"><LinkIcon className="icon icon-sm" /> {selectedJobId && folderActionId === selectedJobId ? "Opening..." : "Open Folder"}</button>
              <button className="btn btn-secondary btn-sm" disabled={!canDownloadSelectedPhotos || downloadActionKey === `photos:${selectedJobId}`} onClick={() => selectedJobId && handleDownloadPhotos(selectedJobId)} type="button"><DownloadIcon className="icon icon-sm" /> {downloadActionKey === `photos:${selectedJobId}` ? "Preparing ZIP..." : "Download Photos ZIP"}</button>
              <button className="btn btn-primary btn-sm" disabled={!canDownloadSelectedCsv || downloadActionKey === `csv:${selectedJobId}`} onClick={() => selectedJobId && handleExport(selectedJobId)} type="button"><DownloadIcon className="icon icon-sm" /> {downloadActionKey === `csv:${selectedJobId}` ? "Preparing CSV..." : "Download Listing CSV"}</button>
            </div>
          </div>
        </div>

        {preview.downloadSessionDir ? <div className="alert alert-info" style={{ marginBottom: "18px" }}><DownloadIcon className="icon icon-md" /><div>Saved photo folder with JPG/PNG-style image files:<span className="mono-text"> {preview.downloadSessionDir}</span></div></div> : null}
        {highPriorityLeadCount > 0 ? <div className="alert alert-success" style={{ marginBottom: "18px" }}><TargetIcon className="icon icon-md" /><div>{highPriorityLeadCount} high-priority lead{highPriorityLeadCount === 1 ? "" : "s"} found in this run.</div></div> : null}

        {!photoItems.length && selectedJobDetail && ACTIVE_JOB_STATUSES.has(selectedStatus) ? <div className="empty-state">This run is still saving photos. Results will appear here automatically.</div> : null}
        {!photoItems.length && !selectedJobDetail ? <div className="empty-state">Pick a run above to see the downloaded photos here.</div> : null}
        {!photoItems.length && selectedJobDetail && !ACTIVE_JOB_STATUSES.has(selectedStatus) && !preview.items.length ? <div className="empty-state">No saved photos were returned for this run.</div> : null}

        {photoItems.length ? <div className="photo-gallery-grid">
          {photoItems.map((item, index) => (
            <article key={`${item.listingId || item.name || "photo-listing"}-${index}`} className="gallery-card">
              <div className="gallery-card-header">
                <div>
                  <h3 className="gallery-card-title">{item.name || "Unnamed listing"}</h3>
                  <p className="gallery-card-copy">{item.address || "No address returned"}</p>
                  <p className="gallery-card-copy">Rank {item.bestRank || "-"} · Category {item.category || "-"} · Lead score {Number(item.leadScore || 0)}</p>
                  {item.downloadDirectory ? <p className="gallery-card-copy">Saved in <span className="mono-text">{item.downloadDirectory}</span></p> : null}
                </div>
                <span className="badge badge-brand">{item.downloadedPhotoCount || item.photoCount} saved</span>
              </div>

              <div className="chip-row" style={{ marginBottom: "14px" }}>
                {item.website ? <a className="query-chip" href={item.website} rel="noreferrer" target="_blank">Website: {item.websiteDomain || "Open"}</a> : <span className="query-chip">No website</span>}
                <span className="query-chip">Emails: {item.emails?.length || 0}</span>
                <span className="query-chip">Socials: {item.socials?.length || 0}</span>
                <span className="query-chip">Owner replies: {item.ownerRepliesVisibleCount || 0}</span>
              </div>

              <div className="photo-thumb-grid">
                {item.photos.slice(0, 8).map((photo, photoIndex) => (
                  <a key={`${photo.localFilePath || photo.url}-${photoIndex}`} className="photo-thumb-link" href={photo.localUrl || photo.downloadUrl || photo.url} rel="noreferrer" target="_blank">
                    <img alt={`${item.name || "Listing"} photo ${photoIndex + 1}`} className="photo-thumb" loading="lazy" src={photo.localUrl || photo.thumbnailUrl || photo.url} />
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div> : null}
      </section>
    </div>
  );
}




