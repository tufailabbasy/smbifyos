import {
  ActivityIcon,
  AlertTriangleIcon,
  ClipboardListIcon,
  DownloadIcon,
  PauseIcon,
  RefreshIcon,
  StopIcon,
} from "./Icons";

function badgeClasses(status = "") {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "complete") return "badge badge-active";
  if (normalized === "paused") return "badge badge-brand";
  if (normalized === "cancelled") return "badge badge-warning";
  if (normalized === "error") return "badge badge-error";
  return "badge badge-brand";
}

function progressWidth(current, total, status = "") {
  if (!total) {
    if (Number(current || 0) <= 0) {
      return "0%";
    }

    return String(status || "").toLowerCase() === "complete" ? "100%" : "45%";
  }

  return `${Math.min(100, Math.round((Number(current || 0) / Number(total)) * 100))}%`;
}

function formatTarget(job) {
  const total = Number(job.total);
  const limit = Number(job.limit);

  if (Number.isFinite(total) && total > 0) {
    return String(total);
  }

  if (Number.isFinite(limit) && limit > 0) {
    return String(limit);
  }

  return "All Available";
}

function shortJobId(jobId = "") {
  if (!jobId) {
    return "—";
  }

  return `${jobId.slice(0, 8)}...${jobId.slice(-4)}`;
}

export default function ActiveJobs({
  jobs,
  jobsError,
  jobsLoading,
  selectedJobId,
  actionJobId,
  onPauseJob,
  onResumeJob,
  onCancelJob,
  onDownloadCsv,
  onSelectJob,
  statusLabel,
}) {
  return (
    <section className="panel-card" id="jobs">
      <div className="card-header">
        <div className="header-row">
          <div className="header-title">
            <span className="header-icon-shell">
              <ActivityIcon className="icon icon-lg" />
            </span>
            <div>
              <p className="section-label">Active Jobs</p>
              <h2 className="section-title">Monitor every run live</h2>
            </div>
          </div>
        </div>
        <p className="section-copy">
          Running jobs refresh automatically. Select any card to inspect results, pause the flow,
          resume from the same phase, or stop the job cleanly.
        </p>
      </div>

      {jobsError ? (
        <div className="alert alert-danger">
          <AlertTriangleIcon className="icon icon-md" />
          <div>{jobsError}</div>
        </div>
      ) : null}

      {jobsLoading && !jobs.length ? (
        <div className="empty-state">Loading jobs...</div>
      ) : null}

      {!jobsLoading && !jobs.length ? (
        <div className="empty-state">
          Start a scrape from the New Job panel and it will appear here automatically.
        </div>
      ) : null}

      <div className="job-list">
        {jobs.map((job) => {
          const isSelected = selectedJobId === job.jobId;
          const total = Number(job.total || job.limit || 0);
          const targetLabel = formatTarget(job);
          const canPause = ["running", "scraping"].includes(job.status);
          const canResume = job.status === "paused";
          const isStopping = Boolean(job.cancelRequested) && job.status !== "cancelled";
          const canCancel = (canPause || canResume) && !isStopping;
          const canDownload = ["complete", "cancelled"].includes(job.status);

          return (
            <article
              key={job.jobId}
              className={`job-card${isSelected ? " is-selected" : ""}`}
            >
              <button
                className="job-card-main"
                onClick={() => onSelectJob(job.jobId)}
                type="button"
              >
                <div className="job-header">
                  <div className="job-title-row">
                    <div>
                      <p className="section-label">Job</p>
                      <h3 className="job-title">
                        {job.state} / {job.businessType}
                      </h3>
                      <p className="job-meta mono-text">Job ID {shortJobId(job.jobId)}</p>
                    </div>
                    <span className={badgeClasses(job.status)}>{statusLabel(job.status)}</span>
                  </div>

                  <div className="progress-grid">
                    <div className="progress-group">
                      <div className="progress-meta">
                        <span>Rows Scraped</span>
                        <strong>
                          {Number(job.scraped || 0)}/{targetLabel}
                        </strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-bar scrape"
                          style={{
                            width: progressWidth(job.scraped, total || job.limit, job.status),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              <div className="header-row" style={{ marginTop: "18px" }}>
                <div className="stats-inline">
                  <span className="stats-chip">
                    <ClipboardListIcon className="icon icon-sm" />
                    Rows {Number(job.scraped || 0)}
                  </span>
                  <span className="stats-chip">
                    <AlertTriangleIcon className="icon icon-sm" />
                    Errors {Number(job.errors || 0)}
                  </span>
                </div>

                <div className="action-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!canPause || actionJobId === job.jobId}
                    onClick={() => onPauseJob(job.jobId)}
                    type="button"
                  >
                    <PauseIcon className="icon icon-sm" />
                    {actionJobId === job.jobId && canPause ? "Pausing..." : "Pause"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={!canResume || actionJobId === job.jobId}
                    onClick={() => onResumeJob(job.jobId)}
                    type="button"
                  >
                    <RefreshIcon className="icon icon-sm" />
                    {actionJobId === job.jobId && canResume ? "Resuming..." : "Resume"}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={!canCancel || actionJobId === job.jobId}
                    onClick={() => onCancelJob(job.jobId)}
                    type="button"
                  >
                    <StopIcon className="icon icon-sm" />
                    {actionJobId === job.jobId || isStopping ? "Stopping..." : "Stop"}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!canDownload}
                    onClick={() => onDownloadCsv(job.jobId)}
                    type="button"
                  >
                    <DownloadIcon className="icon icon-sm" />
                    Download CSV
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!jobs.length ? null : (
        <div className="alert alert-info" style={{ marginTop: "18px" }}>
          <ClipboardListIcon className="icon icon-md" />
          <div>
            Jobs stay in this list for local review. Completed jobs can still be reopened to inspect
            filing rows and export the latest CSV.
          </div>
        </div>
      )}
    </section>
  );
}
