import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { journalService } from "../services/journalService";
import "./CreateJournal.css"; // Reuse the same form styles

const DOMAINS = [
  "Computer Science",
  "Biology",
  "Chemistry",
  "Physics",
  "Mathematics",
  "Medicine",
  "Engineering",
  "Economics",
  "Psychology",
  "Philosophy",
  "History",
  "Linguistics",
  "Environmental Science",
  "Other",
];

export default function EditJournal() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    abstract: "",
    content: "",
    domain: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await journalService.getJournalById(id);
        if (!cancelled) {
          const j = data.journal;
          setForm({
            title: j.title,
            abstract: j.abstract,
            content: j.content,
            domain: j.domain,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load journal.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.title.trim() || form.title.trim().length < 3) {
      setError("Title must be at least 3 characters.");
      return;
    }
    if (!form.abstract.trim()) {
      setError("Abstract is required.");
      return;
    }
    if (!form.content.trim()) {
      setError("Content is required.");
      return;
    }
    if (!form.domain) {
      setError("Please select a domain.");
      return;
    }

    setSaving(true);
    try {
      await journalService.updateJournal(id, form);
      navigate("/my-journals");
    } catch (err) {
      setError(err.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "center", padding: "6rem 0", color: "#64748b" }}>
        Loading journal…
      </div>
    );
  }

  return (
    <div className="cj-wrapper">
      <div className="cj-card">
        <div className="cj-header">
          <span className="cj-badge">Edit Draft</span>
          <h1 className="cj-title">Edit Journal</h1>
          <p className="cj-subtitle">
            Changes are saved to your draft. Publish it from your journal list
            when ready.
          </p>
        </div>

        {error && (
          <div className="cj-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <form
          id="edit-journal-form"
          className="cj-form"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="cj-field">
            <label className="cj-label" htmlFor="ej-title">
              Title <span className="cj-required">*</span>
            </label>
            <input
              id="ej-title"
              className="cj-input"
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Enter a descriptive title"
              maxLength={200}
              required
              aria-required="true"
            />
            <span className="cj-hint">{form.title.length}/200</span>
          </div>

          <div className="cj-field">
            <label className="cj-label" htmlFor="ej-domain">
              Domain <span className="cj-required">*</span>
            </label>
            <select
              id="ej-domain"
              className="cj-select"
              name="domain"
              value={form.domain}
              onChange={handleChange}
              required
              aria-required="true"
            >
              <option value="">Select a research domain</option>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="cj-field">
            <label className="cj-label" htmlFor="ej-abstract">
              Abstract <span className="cj-required">*</span>
            </label>
            <textarea
              id="ej-abstract"
              className="cj-textarea cj-textarea--short"
              name="abstract"
              value={form.abstract}
              onChange={handleChange}
              placeholder="A concise summary of your research"
              maxLength={2000}
              rows={4}
              required
              aria-required="true"
            />
            <span className="cj-hint">{form.abstract.length}/2000</span>
          </div>

          <div className="cj-field">
            <label className="cj-label" htmlFor="ej-content">
              Content <span className="cj-required">*</span>
            </label>
            <textarea
              id="ej-content"
              className="cj-textarea cj-textarea--tall"
              name="content"
              value={form.content}
              onChange={handleChange}
              placeholder="Write the full body of your journal here…"
              rows={16}
              required
              aria-required="true"
            />
          </div>

          <div className="cj-actions">
            <button
              id="ej-cancel-btn"
              type="button"
              className="cj-btn cj-btn--ghost"
              onClick={() => navigate("/my-journals")}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              id="ej-save-btn"
              type="submit"
              className="cj-btn cj-btn--primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
