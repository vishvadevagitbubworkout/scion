import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { journalService } from "../services/journalService";
import "./MyJournals.css";

const STATUS_LABEL = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

function JournalCard({ journal, onPublish, onDelete }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handlePublish() {
    setBusy(true);
    try {
      await onPublish(journal.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this journal? This action cannot be undone."))
      return;
    setBusy(true);
    try {
      await onDelete(journal.id);
    } finally {
      setBusy(false);
    }
  }

  const isPublished = journal.status === "PUBLISHED";

  return (
    <article className="mj-card">
      <div className="mj-card__meta">
        <span className={`mj-badge mj-badge--${journal.status.toLowerCase()}`}>
          {STATUS_LABEL[journal.status]}
        </span>
        <span className="mj-domain">{journal.domain}</span>
      </div>

      <h2 className="mj-card__title">{journal.title}</h2>
      <p className="mj-card__abstract">{journal.abstract}</p>

      <div className="mj-card__footer">
        <time className="mj-date" dateTime={journal.updatedAt}>
          Updated {new Date(journal.updatedAt).toLocaleDateString()}
        </time>
        <div className="mj-card__actions">
          {isPublished && (
            <Link
              to={`/journal/${journal.id}`}
              className="mj-btn mj-btn--ghost"
            >
              View
            </Link>
          )}
          {!isPublished && (
            <button
              id={`edit-btn-${journal.id}`}
              className="mj-btn mj-btn--ghost"
              onClick={() => navigate(`/journals/edit/${journal.id}`)}
              disabled={busy}
            >
              Edit
            </button>
          )}
          {!isPublished && (
            <button
              id={`publish-btn-${journal.id}`}
              className="mj-btn mj-btn--publish"
              onClick={handlePublish}
              disabled={busy}
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
          )}
          <button
            id={`delete-btn-${journal.id}`}
            className="mj-btn mj-btn--danger"
            onClick={handleDelete}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export default function MyJournals() {
  const location = useLocation();
  const navigate = useNavigate();

  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const toastShownRef = useRef(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchJournals() {
      setLoading(true);
      setError("");
      try {
        const data = await journalService.getMyJournals();
        if (!cancelled) setJournals(data.journals || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load your journals.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchJournals();

    return () => { cancelled = true; };
  }, []);

  // Show success toast once after redirect from CreateJournal
  useEffect(() => {
    if (location.state?.created && !toastShownRef.current) {
      toastShownRef.current = true;
      const timer = setTimeout(() => {
        setToast("Journal saved as draft.");
        setTimeout(() => setToast(""), 3500);
        window.history.replaceState({}, "");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  async function handlePublish(id) {
    try {
      await journalService.publishJournal(id);
      setJournals((prev) =>
        prev.map((j) =>
          j.id === id
            ? { ...j, status: "PUBLISHED", publishedAt: new Date().toISOString() }
            : j
        )
      );
      showToast("Journal published successfully.");
    } catch (err) {
      setError(err.message || "Failed to publish journal.");
    }
  }

  async function handleDelete(id) {
    try {
      await journalService.deleteJournal(id);
      setJournals((prev) => prev.filter((j) => j.id !== id));
      showToast("Journal deleted.");
    } catch (err) {
      setError(err.message || "Failed to delete journal.");
    }
  }

  const drafts = journals.filter((j) => j.status === "DRAFT");
  const published = journals.filter((j) => j.status === "PUBLISHED");

  return (
    <div className="mj-wrapper">
      {/* Toast notification */}
      {toast && (
        <div className="mj-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <div className="mj-header">
        <div>
          <h1 className="mj-page-title">My Journals</h1>
          <p className="mj-page-sub">
            {journals.length === 0
              ? "You have no journals yet."
              : `${journals.length} journal${journals.length !== 1 ? "s" : ""} — ${drafts.length} draft${drafts.length !== 1 ? "s" : ""}, ${published.length} published`}
          </p>
        </div>
        <button
          id="create-journal-btn"
          className="mj-btn mj-btn--primary"
          onClick={() => navigate("/journals/create")}
        >
          + New Journal
        </button>
      </div>

      {error && (
        <div className="mj-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mj-loading" aria-busy="true">
          <span className="mj-spinner" />
          Loading your journals…
        </div>
      ) : journals.length === 0 ? (
        <div className="mj-empty">
          <p>You haven&apos;t created any journals yet.</p>
          <button
            id="create-first-journal-btn"
            className="mj-btn mj-btn--primary"
            onClick={() => navigate("/journals/create")}
          >
            Create your first journal
          </button>
        </div>
      ) : (
        <>
          {drafts.length > 0 && (
            <section className="mj-section">
              <h2 className="mj-section-title">Drafts ({drafts.length})</h2>
              <div className="mj-list">
                {drafts.map((j) => (
                  <JournalCard
                    key={j.id}
                    journal={j}
                    onPublish={handlePublish}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </section>
          )}

          {published.length > 0 && (
            <section className="mj-section">
              <h2 className="mj-section-title">Published ({published.length})</h2>
              <div className="mj-list">
                {published.map((j) => (
                  <JournalCard
                    key={j.id}
                    journal={j}
                    onPublish={handlePublish}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
