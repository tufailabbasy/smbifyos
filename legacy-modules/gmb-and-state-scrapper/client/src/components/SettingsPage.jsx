import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  FolderIcon,
  LinkIcon,
  RefreshIcon,
  SlidersHorizontalIcon,
} from "./Icons";

function cleanMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;
}

function PathCard({ title, copy, value, badge }) {
  return (
    <article className="settings-path-card">
      <div className="header-row" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="section-label">{title}</p>
          <p className="settings-path-copy">{copy}</p>
        </div>
        <span className="badge badge-brand">{badge}</span>
      </div>
      <div className="settings-path-value mono-text">{value || "Not set yet"}</div>
    </article>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [draftRoot, setDraftRoot] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState(null);

  async function loadSettings() {
    try {
      setLoading(true);
      const response = await axios.get("/api/settings/storage");
      const nextSettings = response.data?.settings || null;
      setSettings(nextSettings);
      setDraftRoot(nextSettings?.workspaceRoot || "");
      setNotice(null);
    } catch (error) {
      setNotice({ type: "error", message: cleanMessage(error, "Unable to load storage settings.") });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function handlePickFolder() {
    try {
      setPicking(true);
      setNotice(null);
      const response = await axios.post("/api/settings/storage/pick-folder");
      const folderPath = response.data?.folderPath || "";
      const nextSettings = response.data?.settings || settings;
      setSettings(nextSettings);

      if (response.data?.selected && folderPath) {
        setDraftRoot(folderPath);
        setNotice({
          type: "success",
          message: "Folder selected. Click Save This Folder to make it your new storage workspace.",
        });
      }
    } catch (error) {
      setNotice({ type: "error", message: cleanMessage(error, "Unable to open the folder picker.") });
    } finally {
      setPicking(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setNotice(null);
      const response = await axios.post("/api/settings/storage", {
        workspaceRoot: draftRoot,
      });
      const nextSettings = response.data?.settings || null;
      setSettings(nextSettings);
      setDraftRoot(nextSettings?.workspaceRoot || "");
      setNotice({ type: "success", message: response.data?.message || "Storage folder updated." });
    } catch (error) {
      setNotice({ type: "error", message: cleanMessage(error, "Unable to save the storage folder.") });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      setSaving(true);
      setNotice(null);
      const response = await axios.post("/api/settings/storage/reset");
      const nextSettings = response.data?.settings || null;
      setSettings(nextSettings);
      setDraftRoot(nextSettings?.workspaceRoot || "");
      setNotice({ type: "success", message: response.data?.message || "Storage reset." });
    } catch (error) {
      setNotice({ type: "error", message: cleanMessage(error, "Unable to reset storage settings.") });
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenFolder() {
    try {
      setOpening(true);
      setNotice(null);
      const response = await axios.post("/api/settings/storage/open-folder");
      const nextSettings = response.data?.settings || settings;
      setSettings(nextSettings);
      setNotice({ type: "success", message: "Storage folder opened in Windows Explorer." });
    } catch (error) {
      setNotice({ type: "error", message: cleanMessage(error, "Unable to open the storage folder.") });
    } finally {
      setOpening(false);
    }
  }

  const pathCards = useMemo(() => {
    if (!settings) return [];

    return [
      {
        title: "Downloaded Photos",
        copy: "Actual JPG and PNG-style image files from Google Maps runs.",
        value: settings.effectiveDirs?.downloadsDir,
        badge: "User Files",
      },
      {
        title: "CSV and ZIP Exports",
        copy: "Listing CSV exports and photo ZIP downloads are created here.",
        value: settings.effectiveDirs?.outputDir,
        badge: "User Files",
      },
      {
        title: "Rank Snapshots",
        copy: "Saved ranking history and comparison snapshots for GMB runs.",
        value: settings.effectiveDirs?.rankTrackerDir,
        badge: "User Files",
      },
      {
        title: "Internal Run History",
        copy: "Background job metadata that the app uses to restore history.",
        value: settings.effectiveDirs?.jobsDir,
        badge: "App Files",
      },
    ];
  }, [settings]);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-grid">
          <div>
            <span className="hero-eyebrow"><SlidersHorizontalIcon className="icon icon-sm" /> Storage Settings</span>
            <h1 className="hero-title">Choose one clear folder so users always know where BizFinder saves data.</h1>
            <p className="hero-copy">
              This build runs as a local browser app, not an installed desktop app. Pick a workspace folder once,
              and new runs will save photos, CSVs, ZIPs, and tracking files there.
            </p>
          </div>

          <div className="metric-grid">
            <div className="stat-card">
              <div className="stat-header"><span className="stat-label">Storage Mode</span><FolderIcon className="icon icon-lg" /></div>
              <div className="stat-value">{settings?.usingCustomWorkspace ? "Custom" : "Default"}</div>
              <div className="stat-change">{settings?.usingCustomWorkspace ? "User-selected workspace is active" : "App is using built-in local folders"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-header"><span className="stat-label">Current Save Root</span><LinkIcon className="icon icon-lg" /></div>
              <div className="stat-value">{settings?.openPath ? "Ready" : "Not Set"}</div>
              <div className="stat-change mono-text">{settings?.openPath || "Choose a folder below"}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel-card">
        <div className="card-header">
          <div className="header-title">
            <span className="header-icon-shell"><FolderIcon className="icon icon-lg" /></span>
            <div>
              <p className="section-label">Workspace Folder</p>
              <h2 className="section-title">Pick where user-facing files should go</h2>
            </div>
          </div>
          <p className="section-copy">Existing runs stay where they were created. New runs use the latest folder immediately after you save this setting.</p>
        </div>

        {notice ? (
          <div className={notice.type === "error" ? "alert alert-danger" : notice.type === "success" ? "alert alert-success" : "alert alert-info"} style={{ marginBottom: "18px" }}>
            {notice.type === "error" ? <AlertTriangleIcon className="icon icon-md" /> : <CheckCircleIcon className="icon icon-md" />}
            <div>{notice.message}</div>
          </div>
        ) : null}

        {loading ? <div className="empty-state">Loading storage settings...</div> : (
          <div className="form-grid">
            <div className="field-group">
              <label className="field-label" htmlFor="storage-workspace"><FolderIcon className="icon icon-md" /> Workspace folder</label>
              <div className="field-control">
                <FolderIcon className="field-icon icon icon-md" />
                <input
                  className="input-field with-icon"
                  id="storage-workspace"
                  onChange={(event) => setDraftRoot(event.target.value)}
                  placeholder="Choose a folder or paste an absolute path"
                  type="text"
                  value={draftRoot}
                />
              </div>
              <p className="table-subcopy">{settings?.note || "Choose a folder so non-technical users can always find the data."}</p>
            </div>

            <div className="action-row">
              <button className="btn btn-secondary btn-lg" disabled={picking} onClick={handlePickFolder} type="button">
                <FolderIcon className="icon icon-md" />
                {picking ? "Opening Picker..." : "Choose Folder"}
              </button>
              <button className="btn btn-primary btn-lg" disabled={saving || !draftRoot.trim()} onClick={handleSave} type="button">
                <CheckCircleIcon className="icon icon-md" />
                {saving ? "Saving..." : "Save This Folder"}
              </button>
              <button className="btn btn-secondary btn-lg" disabled={opening || !settings?.openPath} onClick={handleOpenFolder} type="button">
                <LinkIcon className="icon icon-md" />
                {opening ? "Opening..." : "Open Current Folder"}
              </button>
              <button className="btn btn-ghost btn-lg" disabled={saving} onClick={handleReset} type="button">
                <RefreshIcon className="icon icon-md" />
                Use App Default
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="card-header">
          <div className="header-title">
            <span className="header-icon-shell"><LinkIcon className="icon icon-lg" /></span>
            <div>
              <p className="section-label">Save Paths</p>
              <h2 className="section-title">Exactly where the app saves each file type</h2>
            </div>
          </div>
          <p className="section-copy">These paths update from the current setting so the user always knows where to look.</p>
        </div>

        {!settings ? <div className="empty-state">Loading current save paths...</div> : (
          <div className="settings-path-grid">
            {pathCards.map((card) => (
              <PathCard key={card.title} {...card} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
