import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import NewJobForm from "./components/NewJobForm";
import ActiveJobs from "./components/ActiveJobs";
import ResultsTable from "./components/ResultsTable";
import StatesGrid from "./components/StatesGrid";
import GmbPhotoScraperPage from "./components/GmbPhotoScraperPage";
import SettingsPage from "./components/SettingsPage";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BriefcaseIcon,
  Building2Icon,
  CameraIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  GlobeIcon,
  MapPinIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SlidersHorizontalIcon,
  TargetIcon,
} from "./components/Icons";

const JOB_REFRESH_MS = 3000;
const RESULTS_PAGE_SIZE = 50;
const ACTIVE_JOB_STATUSES = new Set(["running", "scraping", "paused"]);

const FALLBACK_STATES = [
  {
    id: "florida",
    name: "Florida",
    code: "FL",
    badge: "Ready",
    status: "ready",
    registryUrl: "https://search.sunbiz.org/inquiry/corporationsearch/byname",
  },
  {
    id: "texas",
    name: "Texas",
    code: "TX",
    badge: "Beta",
    status: "beta",
    registryUrl: "https://comptroller.texas.gov/taxes/franchise/account-status/search",
  },
  {
    id: "california",
    name: "California",
    code: "CA",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://bizfile.sos.ca.gov",
  },
  {
    id: "new-york",
    name: "New York",
    code: "NY",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://apps.dos.ny.gov/publicInquiry",
  },
  {
    id: "georgia",
    name: "Georgia",
    code: "GA",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://ecorp.sos.ga.gov/BusinessSearch",
  },
  {
    id: "illinois",
    name: "Illinois",
    code: "IL",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://www.ilsos.gov/corporatellc",
  },
  {
    id: "ohio",
    name: "Ohio",
    code: "OH",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://businesssearch.ohiosos.gov",
  },
  {
    id: "pennsylvania",
    name: "Pennsylvania",
    code: "PA",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://file.dos.pa.gov/search/business",
  },
  {
    id: "arizona",
    name: "Arizona",
    code: "AZ",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl:
      "https://ecorp.azcc.gov/CommonPages/Corp/CorporationSearch.aspx",
  },
  {
    id: "north-carolina",
    name: "North Carolina",
    code: "NC",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl:
      "https://www.sosnc.gov/online_services/search/by_title/_Business_Registration",
  },
  {
    id: "colorado",
    name: "Colorado",
    code: "CO",
    badge: "Ready",
    status: "ready",
    registryUrl: "https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do",
  },
  {
    id: "arkansas",
    name: "Arkansas",
    code: "AR",
    badge: "Ready",
    status: "ready",
    registryUrl: "https://sos-corp-search.ark.org/corps",
  },
  {
    id: "rhode-island",
    name: "Rhode Island",
    code: "RI",
    badge: "Ready",
    status: "ready",
    registryUrl: "https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx",
  },
  {
    id: "new-jersey",
    name: "New Jersey",
    code: "NJ",
    badge: "Ready",
    status: "ready",
    registryUrl: "https://www.njportal.com/DOR/BusinessNameSearch/Search/BusinessName",
  },
  {
    id: "washington",
    name: "Washington",
    code: "WA",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://ccfs.sos.wa.gov/#/BusinessSearch",
  },
  {
    id: "nevada",
    name: "Nevada",
    code: "NV",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://esos.nv.gov/EntitySearch/OnlineEntitySearch",
  },
  {
    id: "michigan",
    name: "Michigan",
    code: "MI",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://cofs.lara.state.mi.us/SearchApi/Search/Search",
  },
  {
    id: "virginia",
    name: "Virginia",
    code: "VA",
    badge: "Coming Soon",
    status: "coming_soon",
    registryUrl: "https://cis.scc.virginia.gov",
  },
];

function cleanMessage(error, fallback) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function statusLabel(status = "") {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "running") return "Running";
  if (normalized === "scraping") return "Scraping";
  if (normalized === "paused") return "Paused";
  if (normalized === "complete") return "Complete";
  if (normalized === "cancelled") return "Cancelled";
  if (normalized === "error") return "Error";
  return normalized ? normalized.replace(/_/g, " ") : "Pending";
}

function canExportStatus(status = "") {
  const normalized = String(status || "").toLowerCase();
  return ["complete", "cancelled"].includes(normalized);
}

function sortJobs(items = []) {
  return [...items].sort((left, right) => {
    return new Date(right.startedAt || 0).getTime() - new Date(left.startedAt || 0).getTime();
  });
}

function mergeStateMetrics(baseStates, jobs) {
  return baseStates.map((state) => {
    const relatedJobs = jobs.filter((job) => job.state === state.id);
    const latestJob = relatedJobs[0];
    const totalScraped = relatedJobs.reduce((sum, job) => sum + (Number(job.scraped) || 0), 0);

    return {
      ...state,
      lastRun: latestJob?.completedAt || latestJob?.startedAt || "",
      totalScraped: relatedJobs.length ? totalScraped : null,
    };
  });
}

async function enrichJobsWithStatuses(baseJobs) {
  const activeJobs = baseJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));

  if (!activeJobs.length) {
    return baseJobs;
  }

  const refreshedJobs = await Promise.all(
    activeJobs.map(async (job) => {
      try {
        const response = await axios.get(`/api/job/status/${job.jobId}`);
        return response.data?.job || job;
      } catch (error) {
        return job;
      }
    })
  );

  const refreshedJobMap = new Map(refreshedJobs.map((job) => [job.jobId, job]));
  return baseJobs.map((job) => refreshedJobMap.get(job.jobId) || job);
}

export default function App() {
  const [activePage, setActivePage] = useState("bizfinder");
  const [states, setStates] = useState(FALLBACK_STATES);
  const [statesError, setStatesError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsError, setJobsError] = useState("");
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [actionJobId, setActionJobId] = useState("");
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsSearch, setResultsSearch] = useState("");
  const [resultsData, setResultsData] = useState({
    rows: [],
    total: 0,
    limit: RESULTS_PAGE_SIZE,
    loading: false,
    error: "",
  });
  const [toast, setToast] = useState(null);
  const jobsSectionRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    async function fetchStates() {
      try {
        const response = await axios.get("/api/states");
        const incomingStates = Array.isArray(response.data?.states)
          ? response.data.states
          : FALLBACK_STATES;

        setStates(
          incomingStates.map((state) => {
            const fallback = FALLBACK_STATES.find((item) => item.id === state.id);
            return {
              ...fallback,
              ...state,
              badge:
                state.status === "ready"
                  ? "Ready"
                  : state.status === "beta"
                    ? "Beta"
                    : "Coming Soon",
            };
          })
        );
        setStatesError("");
      } catch (error) {
        setStates(FALLBACK_STATES);
        setStatesError(cleanMessage(error, "Unable to load state registry status."));
      }
    }

    fetchStates();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchJobs() {
      try {
        if (!cancelled && !jobs.length) {
          setJobsLoading(true);
        }

        const response = await axios.get("/api/job/list");
        const baseJobs = Array.isArray(response.data?.jobs) ? response.data.jobs : [];
        const nextJobs = sortJobs(await enrichJobsWithStatuses(baseJobs));

        if (cancelled) {
          return;
        }

        setJobs(nextJobs);
        setJobsError("");
        setSelectedJobId((current) => {
          if (current && nextJobs.some((job) => job.jobId === current)) {
            return current;
          }

          return nextJobs[0]?.jobId || "";
        });
      } catch (error) {
        if (!cancelled) {
          setJobsError(cleanMessage(error, "Unable to load jobs right now."));
        }
      } finally {
        if (!cancelled) {
          setJobsLoading(false);
        }
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
      setResultsData({
        rows: [],
        total: 0,
        limit: RESULTS_PAGE_SIZE,
        loading: false,
        error: "",
      });
      return;
    }

    let cancelled = false;

    async function fetchResults() {
      try {
        setResultsData((current) => ({
          ...current,
          loading: true,
          error: "",
        }));

        const response = await axios.get(`/api/results/${selectedJobId}`, {
          params: {
            page: resultsPage,
            limit: RESULTS_PAGE_SIZE,
          },
        });

        if (cancelled) {
          return;
        }

        setResultsData({
          rows: Array.isArray(response.data?.results) ? response.data.results : [],
          total: Number(response.data?.total) || 0,
          limit: Number(response.data?.limit) || RESULTS_PAGE_SIZE,
          loading: false,
          error: "",
        });
      } catch (error) {
        if (!cancelled) {
          setResultsData({
            rows: [],
            total: 0,
            limit: RESULTS_PAGE_SIZE,
            loading: false,
            error: cleanMessage(error, "Unable to load results for this job."),
          });
        }
      }
    }

    fetchResults();

    return () => {
      cancelled = true;
    };
  }, [selectedJobId, resultsPage, jobs]);

  useEffect(() => {
    setResultsPage(1);
  }, [selectedJobId]);

  function showToast(type, message) {
    setToast({ type, message });

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3500);
  }

  async function handleStartJob(formValues) {
    try {
      setIsStartingJob(true);

      const response = await axios.post("/api/job/start", {
        state: formValues.state,
        businessType: formValues.businessType,
        limit: formValues.limit === "all" ? null : Number(formValues.limit),
      });

      const nextJob = response.data?.job;
      const nextJobId = response.data?.jobId || nextJob?.jobId;

      if (nextJob) {
        setJobs((current) => sortJobs([nextJob, ...current]));
      } else {
        const jobsResponse = await axios.get("/api/job/list");
        setJobs(sortJobs(Array.isArray(jobsResponse.data?.jobs) ? jobsResponse.data.jobs : []));
      }

      if (nextJobId) {
        setSelectedJobId(nextJobId);
        setResultsPage(1);
      }

      showToast("success", response.data?.message || "Job started successfully.");

      window.setTimeout(() => {
        jobsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (error) {
      showToast("error", cleanMessage(error, "Unable to start job."));
    } finally {
      setIsStartingJob(false);
    }
  }

  async function handleCancelJob(jobId) {
    try {
      setActionJobId(jobId);
      const response = await axios.post(`/api/job/cancel/${jobId}`);
      const nextJob = response.data?.job;

      setJobs((current) =>
        current.map((job) =>
          job.jobId === jobId
            ? {
                ...job,
                ...nextJob,
                cancelRequested: true,
              }
            : job
        )
      );
      showToast("success", "Stop requested.");
    } catch (error) {
      showToast("error", cleanMessage(error, "Unable to stop that job."));
    } finally {
      setActionJobId("");
    }
  }

  async function handlePauseJob(jobId) {
    try {
      setActionJobId(jobId);
      const response = await axios.post(`/api/job/pause/${jobId}`);
      const nextJob = response.data?.job;

      if (nextJob) {
        setJobs((current) =>
          sortJobs(current.map((job) => (job.jobId === jobId ? nextJob : job)))
        );
      }

      showToast("success", "Pause requested.");
    } catch (error) {
      showToast("error", cleanMessage(error, "Unable to pause that job."));
    } finally {
      setActionJobId("");
    }
  }

  async function handleResumeJob(jobId) {
    try {
      setActionJobId(jobId);
      const response = await axios.post(`/api/job/resume/${jobId}`);
      const nextJob = response.data?.job;

      if (nextJob) {
        setJobs((current) =>
          sortJobs(current.map((job) => (job.jobId === jobId ? nextJob : job)))
        );
      }

      showToast("success", "Resume requested.");
    } catch (error) {
      showToast("error", cleanMessage(error, "Unable to resume that job."));
    } finally {
      setActionJobId("");
    }
  }

  function handleDownloadCsv(jobId) {
    const link = document.createElement("a");
    link.href = `/api/export/${jobId}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const selectedJob = jobs.find((job) => job.jobId === selectedJobId) || null;
  const selectedJobCanExport = canExportStatus(selectedJob?.status);
  const statesWithMetrics = useMemo(() => mergeStateMetrics(states, jobs), [states, jobs]);
  const filteredRows = useMemo(() => {
    return resultsData.rows.filter((row) => {
      if (!resultsSearch.trim()) {
        return true;
      }

      const searchValue = resultsSearch.toLowerCase();
      return (
        String(row.businessName || "").toLowerCase().includes(searchValue) ||
        String(row.city || "").toLowerCase().includes(searchValue)
      );
    });
  }, [resultsData.rows, resultsSearch]);

  const dashboardMetrics = useMemo(() => {
    const readyStates = states.filter((state) => state.status === "ready").length;
    const betaStates = states.filter((state) => state.status === "beta").length;
    const liveJobs = jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
    const totalRows = jobs.reduce(
      (sum, job) => sum + (Number(job.total || job.scraped) || 0),
      0
    );

    return {
      readyStates,
      betaStates,
      liveJobs,
      totalRows,
    };
  }, [states, jobs]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-logo">
          <span className="brand-mark">
            <Building2Icon className="icon icon-lg" />
          </span>
          <span>BizFinder Pro</span>
        </div>

        <div className="page-switcher">
          <button
            className={activePage === "bizfinder" ? "page-toggle is-active" : "page-toggle"}
            onClick={() => setActivePage("bizfinder")}
            type="button"
          >
            <Building2Icon className="icon icon-sm" />
            Registry Engine
          </button>
          <button
            className={
              activePage === "gmb-photo-scraper" ? "page-toggle is-active" : "page-toggle"
            }
            onClick={() => setActivePage("gmb-photo-scraper")}
            type="button"
          >
            <CameraIcon className="icon icon-sm" />
            GMB Photo Scraper
          </button>
          <button
            className={activePage === "settings" ? "page-toggle is-active" : "page-toggle"}
            onClick={() => setActivePage("settings")}
            type="button"
          >
            <SlidersHorizontalIcon className="icon icon-sm" />
            Settings
          </button>
        </div>

        {activePage === "bizfinder" ? (
          <nav className="topbar-nav">
            <a className="topbar-link" href="#new-job">
              <PlayIcon className="icon icon-sm" />
              New Job
            </a>
            <a className="topbar-link" href="#jobs">
              <ActivityIcon className="icon icon-sm" />
              Jobs
            </a>
            <a className="topbar-link" href="#results">
              <ClipboardListIcon className="icon icon-sm" />
              Results
            </a>
            <a className="topbar-link" href="#coverage">
              <MapPinIcon className="icon icon-sm" />
              Coverage
            </a>
          </nav>
        ) : null}

        <div className="topbar-actions">
          <span className="badge badge-brand">Local App</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => window.location.reload()}
            type="button"
          >
            <RefreshIcon className="icon icon-sm" />
            Refresh
          </button>
        </div>
      </header>

      {toast ? (
        <div className="toast-shell">
          <div
            className={`toast-card ${
              toast.type === "success" ? "alert alert-success" : "alert alert-danger"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircleIcon className="icon icon-md" />
            ) : (
              <AlertTriangleIcon className="icon icon-md" />
            )}
            <div>
              <p className="toast-title">{toast.type === "success" ? "Success" : "Error"}</p>
              <p className="toast-copy">{toast.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      <main className="section-stack">
        {activePage === "bizfinder" ? (
          <>
            <section className="hero-panel">
              <div className="hero-grid">
                <div>
                  <span className="hero-eyebrow">
                    <TargetIcon className="icon icon-sm" />
                    Local Registry Lead Engine
                  </span>
                  <h1 className="hero-title">Clean business registry scraping with a modern local workflow.</h1>
                  <p className="hero-copy">
                    Run targeted state registry searches, track job progress in real time, pause or
                    resume long jobs, and export polished CSV outputs from one focused workspace.
                  </p>
                  <div className="hero-actions">
                    <a className="btn btn-primary btn-lg" href="#new-job">
                      <PlayIcon className="icon icon-md" />
                      Start New Job
                    </a>
                    <a className="btn btn-secondary btn-lg" href="#coverage">
                      <MapPinIcon className="icon icon-md" />
                      View Coverage
                    </a>
                  </div>
                </div>

                <div className="metric-grid">
                  <div className="stat-card">
                    <div className="stat-header">
                      <span className="stat-label">Ready States</span>
                      <CheckCircleIcon className="icon icon-lg" />
                    </div>
                    <div className="stat-value">{dashboardMetrics.readyStates}</div>
                    <div className="stat-change up">
                      {dashboardMetrics.betaStates} beta connector
                      {dashboardMetrics.betaStates === 1 ? "" : "s"} available next
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-header">
                      <span className="stat-label">Live Jobs</span>
                      <BriefcaseIcon className="icon icon-lg" />
                    </div>
                    <div className="stat-value">{dashboardMetrics.liveJobs}</div>
                    <div className="stat-change brand">Tracked across the current local session</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-header">
                      <span className="stat-label">Rows Collected</span>
                      <ClipboardListIcon className="icon icon-lg" />
                    </div>
                    <div className="stat-value">{dashboardMetrics.totalRows}</div>
                    <div className="stat-change">All scraped rows currently cached in memory</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-header">
                      <span className="stat-label">Current Selection</span>
                      <ActivityIcon className="icon icon-lg" />
                    </div>
                    <div className="stat-value">
                      {selectedJob ? Number(selectedJob.total || selectedJob.scraped || 0) : 0}
                    </div>
                    <div className="stat-change">
                      {selectedJob ? `${selectedJob.state} / ${selectedJob.businessType}` : "Choose a job to inspect"}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="content-grid">
              <NewJobForm
                states={states}
                isSubmitting={isStartingJob}
                onStartJob={handleStartJob}
              />

              <aside className="panel-card">
                <div className="card-header">
                  <div className="header-title">
                    <span className="header-icon-shell">
                      <GlobeIcon className="icon icon-lg" />
                    </span>
                    <div>
                      <p className="section-label">Workflow Notes</p>
                      <h2 className="section-title">How the current build behaves</h2>
                    </div>
                  </div>
                  <p className="section-copy">
                    The redesigned interface keeps the important operating details visible without
                    cluttering the main scraping flow.
                  </p>
                </div>

                <div className="note-grid">
                  <div className="note-card">
                    <GlobeIcon className="icon icon-lg" />
                    <div>
                      <strong>Direct browser workflow</strong>
                      <p>
                        Registry jobs no longer depend on any external GMB API. The dedicated
                        Google Maps workspace handles its own browser-driven collection flow.
                      </p>
                    </div>
                  </div>

                  <div className="note-card">
                    <PauseIcon className="icon icon-lg" />
                    <div>
                      <strong>Pause and resume controls</strong>
                      <p>
                        Running jobs can now be paused mid-flow and resumed from the same stage instead
                        of restarting from zero.
                      </p>
                    </div>
                  </div>

                  <div className="note-card">
                    <AlertTriangleIcon className="icon icon-lg" />
                    <div>
                      <strong>Failure behavior</strong>
                      <p>
                        Backend issues stay isolated inside their own panels, so the page remains usable
                        even if one request fails.
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </section>

            <section ref={jobsSectionRef}>
              <ActiveJobs
                jobs={jobs}
                jobsError={jobsError}
                jobsLoading={jobsLoading}
                selectedJobId={selectedJobId}
                actionJobId={actionJobId}
                onPauseJob={handlePauseJob}
                onResumeJob={handleResumeJob}
                onCancelJob={handleCancelJob}
                onDownloadCsv={handleDownloadCsv}
                onSelectJob={(jobId) => {
                  setSelectedJobId(jobId);
                  setResultsPage(1);
                }}
                statusLabel={statusLabel}
              />
            </section>

            <ResultsTable
              selectedJob={selectedJob}
              canExport={selectedJobCanExport}
              rows={filteredRows}
              loading={resultsData.loading}
              error={resultsData.error}
              page={resultsPage}
              limit={resultsData.limit}
              total={resultsData.total}
              searchValue={resultsSearch}
              onSearchChange={setResultsSearch}
              onPageChange={setResultsPage}
              onExport={handleDownloadCsv}
            />

            <StatesGrid states={statesWithMetrics} statesError={statesError} />
          </>
        ) : activePage === "gmb-photo-scraper" ? (
          <GmbPhotoScraperPage />
        ) : (
          <SettingsPage />
        )}
      </main>
    </div>
  );
}



