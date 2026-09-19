import { ActivityIcon, ClockIcon, GlobeIcon, MapPinIcon } from "./Icons";

function badgeClass(status = "") {
  if (status === "ready") return "badge badge-active";
  if (status === "beta") return "badge badge-brand";
  return "badge badge-warning";
}

function badgeLabel(status = "") {
  if (status === "ready") return "Ready";
  if (status === "beta") return "Beta";
  return "Coming Soon";
}

function formatDate(value) {
  if (!value) {
    return "Never";
  }

  try {
    return new Date(value).toLocaleDateString();
  } catch (error) {
    return "Never";
  }
}

function formatRegistryUrl(value = "") {
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch (error) {
    return value || "Registry source";
  }
}

export default function StatesGrid({ states, statesError }) {
  return (
    <section className="panel-card" id="coverage">
      <div className="card-header">
        <div className="header-row">
          <div className="header-title">
            <span className="header-icon-shell">
              <MapPinIcon className="icon icon-lg" />
            </span>
            <div>
              <p className="section-label">States Overview</p>
              <h2 className="section-title">Registry coverage map</h2>
            </div>
          </div>
        </div>
        <p className="section-copy">
          Review which registries are ready for live scraping, which connectors are in beta, and
          where the next implementation work is queued.
        </p>
      </div>

      {statesError ? (
        <div className="alert alert-warning" style={{ marginBottom: "18px" }}>
          <GlobeIcon className="icon icon-md" />
          <div>{statesError}</div>
        </div>
      ) : null}

      <div className="state-grid">
        {states.map((state) => (
          <article className="state-card" key={state.id}>
            <div className="state-header">
              <span className="header-icon-shell" style={{ width: "34px", height: "34px" }}>
                <MapPinIcon className="icon icon-md" />
              </span>
              <div className="state-info">
                <h3 className="state-name">{state.name}</h3>
                <div className="state-code mono-text">{state.code || "—"}</div>
              </div>
              <span className={badgeClass(state.status)}>{badgeLabel(state.status)}</span>
            </div>

            <a
              className="mono-link"
              href={state.registryUrl}
              rel="noreferrer"
              target="_blank"
            >
              <GlobeIcon className="icon icon-sm" />
              {formatRegistryUrl(state.registryUrl)}
            </a>

            <div className="state-meta">
              <div className="meta-row">
                <ClockIcon className="icon icon-sm" />
                Last run {formatDate(state.lastRun)}
              </div>
              <div className="meta-row">
                <ActivityIcon className="icon icon-sm" />
                Total scraped {state.totalScraped === null ? "—" : state.totalScraped}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
