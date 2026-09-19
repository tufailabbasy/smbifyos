import {
  ClipboardListIcon,
  DownloadIcon,
  LinkIcon,
  SearchIcon,
  XCircleIcon,
} from "./Icons";

function pageCount(total, limit) {
  if (!total || !limit) {
    return 1;
  }

  return Math.max(1, Math.ceil(Number(total) / Number(limit)));
}

function rowStatusClass(status = "") {
  const normalized = String(status || "").toUpperCase();

  if (normalized === "ACTIVE") return "badge badge-active";
  if (normalized === "INACTIVE") return "badge badge-inactive";
  return "badge badge-warning";
}

export default function ResultsTable({
  selectedJob,
  canExport,
  rows,
  loading,
  error,
  page,
  limit,
  total,
  searchValue,
  onSearchChange,
  onPageChange,
  onExport,
}) {
  const totalPages = pageCount(total, limit);

  return (
    <section className="panel-card" id="results">
      <div className="card-header">
        <div className="header-row">
          <div className="header-title">
            <span className="header-icon-shell">
              <ClipboardListIcon className="icon icon-lg" />
            </span>
            <div>
              <p className="section-label">Results Table</p>
              <h2 className="section-title">Review current job leads</h2>
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={!selectedJob || !canExport}
            onClick={() => selectedJob && onExport(selectedJob.jobId)}
            type="button"
          >
            <DownloadIcon className="icon icon-sm" />
            Export CSV
          </button>
        </div>
        <p className="section-copy">
          {selectedJob
            ? `Viewing ${selectedJob.state} / ${selectedJob.businessType}`
            : "Select a job card to inspect filing rows, filter them, and export the result set."}
        </p>
      </div>

      <div className="table-toolbar">
        <div className="field-control" style={{ minWidth: "min(100%, 340px)" }}>
          <SearchIcon className="field-icon icon icon-md" />
          <input
            className="input-field with-icon"
            placeholder="Search by business name or city"
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" style={{ marginTop: "18px" }}>
          <XCircleIcon className="icon icon-md" />
          <div>{error}</div>
        </div>
      ) : null}

      {!selectedJob ? (
        <div className="empty-state" style={{ marginTop: "18px" }}>
          Start or select a job to inspect filing rows here.
        </div>
      ) : null}

      {selectedJob ? (
        <div className="table-wrapper" style={{ marginTop: "18px" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Business Name</th>
                <th>Status</th>
                <th>City</th>
                <th>State</th>
                <th>Phone</th>
                <th>Source URL</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Loading results...</td>
                </tr>
              ) : null}

              {!loading && !rows.length ? (
                <tr>
                  <td colSpan={6}>No rows match the current search on this page.</td>
                </tr>
              ) : null}

              {!loading
                ? rows.map((row, index) => (
                    <tr key={`${row.businessName || "row"}-${index}`}>
                      <td>
                        <strong>{row.businessName || "—"}</strong>
                      </td>
                      <td>
                        <span className={rowStatusClass(row.status)}>
                          {row.status || "Unknown"}
                        </span>
                      </td>
                      <td>{row.city || "—"}</td>
                      <td>{row.state || "—"}</td>
                      <td>{row.phone || "—"}</td>
                      <td>
                        {row.sourceUrl ? (
                          <a
                            className="table-link"
                            href={row.sourceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <LinkIcon className="icon icon-sm" />
                            View Filing
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="header-row" style={{ marginTop: "18px" }}>
        <p className="section-copy" style={{ marginTop: 0 }}>
          Page {page} of {totalPages} {selectedJob ? `· ${total} total rows on the backend` : ""}
        </p>
        <div className="pagination-row">
          <button
            className="btn btn-ghost btn-sm"
            disabled={!selectedJob || page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            type="button"
          >
            Prev
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!selectedJob || page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
