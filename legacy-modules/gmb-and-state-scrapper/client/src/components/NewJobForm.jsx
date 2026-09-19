import { useEffect, useState } from "react";
import {
  BriefcaseIcon,
  GlobeIcon,
  MapPinIcon,
  PlayIcon,
  SearchIcon,
  TargetIcon,
} from "./Icons";

const LIMIT_OPTIONS = [
  { value: "all", label: "All Available" },
  { value: "100", label: "100" },
  { value: "250", label: "250" },
  { value: "500", label: "500" },
  { value: "1000", label: "1000" },
];

function badgeLabel(status = "") {
  if (status === "ready") return "Ready";
  if (status === "beta") return "Beta";
  return "Coming Soon";
}

function badgeClass(status = "") {
  if (status === "ready") return "badge badge-active";
  if (status === "beta") return "badge badge-brand";
  return "badge badge-warning";
}

export default function NewJobForm({
  states,
  isSubmitting,
  onStartJob,
}) {
  const [formValues, setFormValues] = useState({
    state: "florida",
    businessType: "",
    limit: "all",
  });

  useEffect(() => {
    if (!states.some((state) => state.id === formValues.state)) {
      setFormValues((current) => ({
        ...current,
        state: states[0]?.id || "florida",
      }));
    }
  }, [states, formValues.state]);

  function updateField(field, value) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  const selectedState = states.find((state) => state.id === formValues.state) || null;
  const canStartSelectedState =
    selectedState?.status === "ready" || selectedState?.status === "beta";

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canStartSelectedState) {
      return;
    }

    await onStartJob(formValues);
  }

  return (
    <section className="panel-card" id="new-job">
      <div className="card-header">
        <div className="header-row">
          <div className="header-title">
            <span className="header-icon-shell">
              <PlayIcon className="icon icon-lg" />
            </span>
            <div>
              <p className="section-label">New Job</p>
              <h2 className="section-title">Launch a fresh scrape</h2>
            </div>
          </div>
          {selectedState ? (
            <span className={badgeClass(selectedState.status)}>
              {badgeLabel(selectedState.status)}
            </span>
          ) : null}
        </div>
        <p className="section-copy">
          Enter one service category only. The scraper now expands that term into close registry
          keywords like singular, plural, and service-adjacent phrases so states can still return
          relevant businesses even when names are not an exact match.
        </p>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="state">
            <MapPinIcon className="icon icon-md" />
            Select State
          </label>
          <div className="field-control">
            <MapPinIcon className="field-icon icon icon-md" />
            <select
              className="select-field with-icon"
              id="state"
              value={formValues.state}
              onChange={(event) => updateField("state", event.target.value)}
            >
              {states.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.name} - {badgeLabel(state.status)}
                </option>
              ))}
            </select>
          </div>
          {!canStartSelectedState ? (
            <p className="field-help">
              This state is still on the roadmap. Real scraping is not wired yet, so use a Ready or
              Beta state for live runs.
            </p>
          ) : selectedState?.registryUrl ? (
            <a
              className="mono-link"
              href={selectedState.registryUrl}
              rel="noreferrer"
              target="_blank"
            >
              <GlobeIcon className="icon icon-sm" />
              Registry source
            </a>
          ) : null}
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="business-type">
            <SearchIcon className="icon icon-md" />
            Business Type
          </label>
          <div className="field-control">
            <BriefcaseIcon className="field-icon icon icon-md" />
            <input
              className="input-field with-icon"
              id="business-type"
              placeholder="e.g. plumber, HVAC, water damage restoration"
              type="text"
              value={formValues.businessType}
              onChange={(event) => updateField("businessType", event.target.value)}
            />
          </div>
          <p className="field-help">
            Example: <span className="mono-text">water damage</span> can also try related registry
            terms like restoration, mitigation, and remediation behind the scenes.
          </p>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="limit">
            <TargetIcon className="icon icon-md" />
            Limit
          </label>
          <div className="field-control">
            <TargetIcon className="field-icon icon icon-md" />
            <select
              className="select-field with-icon"
              id="limit"
              value={formValues.limit}
              onChange={(event) => updateField("limit", event.target.value)}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="alert alert-info">
          <GlobeIcon className="icon icon-md" />
          <div>
            Registry jobs now stay focused on direct state-record scraping. Google Maps work runs
            from the dedicated GMB Photo Scraper page.
          </div>
        </div>

        <div className="action-row">
          <button
            className="btn btn-primary btn-lg"
            disabled={
              isSubmitting ||
              !canStartSelectedState ||
              !String(formValues.businessType || "").trim()
            }
            type="submit"
          >
            <PlayIcon className="icon icon-md" />
            {isSubmitting ? "Starting..." : "Start Job"}
          </button>
        </div>
      </form>
    </section>
  );
}
