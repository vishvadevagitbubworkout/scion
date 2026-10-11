import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { journalService } from "../services/journalService";
import "./Home.css";

const PAGE_SIZE = 9;

function formatDate(value) {
  if (!value) return "Recently published";
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function JournalTile({ journal, featured = false }) {
  return (
    <article className={`story-card${featured ? " story-card-featured" : ""}`}>
      <Link
        className="story-card-link"
        to={`/journal/${journal.id}`}
        aria-label={`Read ${journal.title}`}
      >
        <div className={`story-art${featured ? " story-art-featured" : ""}`} aria-hidden="true">
          <span className="story-art-mark">{journal.domain?.slice(0, 1) || "S"}</span>
          <span className="story-art-caption">SCION / FIELD NOTES</span>
        </div>
        <div className="story-copy">
          <div className="story-meta">
            <span>{journal.domain}</span>
            <time dateTime={journal.publishedAt || journal.createdAt}>
              {formatDate(journal.publishedAt || journal.createdAt)}
            </time>
          </div>
          <h3>{journal.title}</h3>
          <p>{journal.abstract}</p>
          <div className="story-byline">
            <span className="author-avatar" aria-hidden="true">
              {(journal.author?.name || "S").slice(0, 1).toUpperCase()}
            </span>
            <span>{journal.author?.name || "Scion contributor"}</span>
            <span className="story-read-more">Read story <span aria-hidden="true">↗</span></span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default function Home() {
  const { currentUser, isAuthenticated } = useAuth();
  const [journals, setJournals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({ search: "", domain: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadFilteredJournals() {
      setError("");
      try {
        const data = await journalService.getPublishedJournals({
          ...filters,
          page: 1,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setJournals(data.journals || []);
        setPagination(data.pagination || { page: 1, pages: 1, total: data.journals?.length || 0 });
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || "We couldn't load the latest stories.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFilteredJournals();
    return () => { cancelled = true; };
  }, [filters]);

  const loadJournals = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const data = await journalService.getPublishedJournals({
        ...filters,
        page,
        limit: PAGE_SIZE,
      });
      setJournals(data.journals || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: data.journals?.length || 0 });
    } catch (requestError) {
      setError(requestError.message || "We couldn't load the latest stories.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const domains = [...new Set(journals.map((journal) => journal.domain).filter(Boolean))].slice(0, 5);
  const featuredJournal = journals[0];
  const supportingJournals = journals.slice(1);

  function submitSearch(event) {
    event.preventDefault();
    setLoading(true);
    setFilters((current) => ({ ...current, search: searchInput.trim() }));
  }

  function chooseDomain(domain) {
    setLoading(true);
    setFilters((current) => ({ ...current, domain: current.domain === domain ? "" : domain }));
  }

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="hero-inner">
          <div className="hero-text">
            <p className="eyebrow"><span className="eyebrow-line" /> An independent journal for curious minds</p>
            <h1>Ideas worth<br /><em>staying with.</em></h1>
            <p className="hero-description">
              Thoughtful writing on the questions shaping our world — from the people closest to them.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#discover">Explore the journal <span aria-hidden="true">↓</span></a>
              {isAuthenticated && (currentUser?.role === "AUTHOR" || currentUser?.role === "ROOT") ? (
                <Link className="button button-quiet" to="/author">Write with us <span aria-hidden="true">↗</span></Link>
              ) : (
                <Link className="button button-quiet" to="/register">Become a contributor <span aria-hidden="true">↗</span></Link>
              )}
            </div>
            <div className="hero-note">
              <span className="hero-note-dot" />
              <span>Independent voices. Lasting perspectives.</span>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="hero-sun" />
            <div className="hero-circle hero-circle-one" />
            <div className="hero-circle hero-circle-two" />
            <div className="hero-column" />
            <div className="hero-visual-label">A quieter place<br />for bigger ideas</div>
            <span className="hero-index">VOL. 01 — EST. 2024</span>
          </div>
        </div>
        <div className="hero-bottom">
          <span>READ SLOWLY</span><span className="hero-bottom-rule" /><span>THINK DEEPLY</span>
        </div>
      </section>

      <section className="discovery-section" id="discover">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> The latest</p>
            <h2>Stories for a more<br /><em>considered world.</em></h2>
          </div>
          <p className="section-intro">
            Essays, research, and reflections across the ideas that move us forward.
          </p>
        </div>

        <div className="discovery-tools">
          <div className="topic-filters" aria-label="Filter stories by topic">
            <button
              type="button"
              className={`topic-chip${!filters.domain ? " topic-chip-active" : ""}`}
              onClick={() => chooseDomain("")}
              aria-pressed={!filters.domain}
            >All stories</button>
            {domains.map((domain) => (
              <button
                type="button"
                key={domain}
                className={`topic-chip${filters.domain === domain ? " topic-chip-active" : ""}`}
                onClick={() => chooseDomain(domain)}
                aria-pressed={filters.domain === domain}
              >{domain}</button>
            ))}
          </div>
          <form className="story-search" onSubmit={submitSearch} role="search">
            <label className="visually-hidden" htmlFor="story-search">Search stories</label>
            <input
              id="story-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search the journal"
              maxLength={80}
            />
            <button type="submit" aria-label="Search stories">⌕</button>
          </form>
        </div>

        {error && (
          <div className="feed-state feed-error" role="alert">
            <strong>Stories are temporarily unavailable.</strong>
            <span>{error}</span>
            <button type="button" className="text-button" onClick={() => loadJournals(1)}>Try again</button>
          </div>
        )}

        {loading ? (
          <div className="story-grid" aria-label="Loading stories" aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => <div className="story-skeleton" key={index} />)}
          </div>
        ) : !error && journals.length === 0 ? (
          <div className="feed-state">
            <strong>{filters.search || filters.domain ? "No stories match those filters." : "The journal is just getting started."}</strong>
            <span>{filters.search || filters.domain ? "Try a different search or browse every story." : "Check back soon for new perspectives from our contributors."}</span>
            {(filters.search || filters.domain) && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSearchInput("");
                  setLoading(true);
                  setFilters({ search: "", domain: "" });
                }}
              >Clear filters</button>
            )}
          </div>
        ) : !error && (
          <div className="story-grid">
            {featuredJournal && <JournalTile journal={featuredJournal} featured />}
            {supportingJournals.map((journal) => <JournalTile journal={journal} key={journal.id} />)}
          </div>
        )}

        {!loading && !error && pagination.pages > 1 && (
          <div className="feed-pagination">
            <span>Page {pagination.page} of {pagination.pages}</span>
            <div>
              <button type="button" onClick={() => loadJournals(pagination.page - 1)} disabled={pagination.page <= 1}>← Previous</button>
              <button type="button" onClick={() => loadJournals(pagination.page + 1)} disabled={pagination.page >= pagination.pages}>Next →</button>
            </div>
          </div>
        )}
      </section>

      <section className="invitation-band">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> For writers and researchers</p>
          <h2>Bring your perspective<br /><em>to the conversation.</em></h2>
        </div>
        <div className="invitation-band-action">
          <p>Scion is built by people who believe careful thinking can make a difference.</p>
          <Link className="button button-light" to={isAuthenticated ? "/author" : "/register"}>
            {isAuthenticated ? "Go to your workspace" : "Join the community"} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
