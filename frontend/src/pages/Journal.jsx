import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { journalService } from "../services/journalService";
import "./Journal.css";

export default function Journal() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [journal, setJournal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await journalService.getJournalById(id);
        if (!cancelled) setJournal(data.journal);
      } catch (err) {
        if (!cancelled) {
          if (err.status === 404) {
            setError("Journal not found or is not publicly accessible.");
          } else {
            setError(err.message || "Failed to load journal.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="jr-loading">
        <span className="jr-spinner" aria-hidden="true" />
        Loading journal…
      </div>
    );
  }

  if (error || !journal) {
    return (
      <div className="jr-wrapper">
        <div className="jr-not-found">
          <h1>Journal Not Found</h1>
          <p>{error || "This journal does not exist or is not publicly accessible."}</p>
          <button className="jr-btn" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const publishedDate = journal.publishedAt
    ? new Date(journal.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="jr-wrapper">
      <article className="jr-article" aria-label={`Journal: ${journal.title}`}>
        {/* Breadcrumb */}
        <nav className="jr-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true"> › </span>
          <span>{journal.domain}</span>
        </nav>

        {/* Header */}
        <header className="jr-header">
          <div className="jr-meta-row">
            <span className="jr-domain-badge">{journal.domain}</span>
            {journal.status === "DRAFT" && (
              <span className="jr-draft-badge">Draft</span>
            )}
          </div>

          <h1 className="jr-title">{journal.title}</h1>

          <div className="jr-byline">
            {journal.author?.name && (
              <span className="jr-author">By {journal.author.name}</span>
            )}
            {publishedDate && (
              <time className="jr-date" dateTime={journal.publishedAt}>
                Published {publishedDate}
              </time>
            )}
          </div>
        </header>

        {/* Abstract */}
        <section className="jr-abstract" aria-label="Abstract">
          <h2 className="jr-abstract-label">Abstract</h2>
          <p className="jr-abstract-text">{journal.abstract}</p>
        </section>

        <hr className="jr-divider" />

        {/* Content */}
        <section className="jr-content" aria-label="Journal content">
          {journal.content.split("\n").map((paragraph, i) =>
            paragraph.trim() ? (
              <p key={i}>{paragraph}</p>
            ) : (
              <br key={i} />
            )
          )}
        </section>
      </article>
    </div>
  );
}