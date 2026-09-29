import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { journalService } from "../services/journalService";
import "./CreateJournal.css";

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

export default function CreateJournal() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    abstract: "",
    content: "",
    domain: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    try {
      const res = await journalService.createJournal(form);
      navigate(`/my-journals`, { state: { created: true, id: res.journal.id } });
    } catch (err) {
      setError(err.message || "Failed to create journal. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cj-wrapper">
      <div className="cj-card">
        <div className="cj-header">
          <span className="cj-badge">New Journal</span>
          <h1 className="cj-title">Create a Journal Entry</h1>
          <p className="cj-subtitle">
            Your entry will be saved as a <strong>draft</strong>. You can
            publish it from your journal list.
          </p>
        </div>

        {error && (
          <div className="cj-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <form
          id="create-journal-form"
          className="cj-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* Title */}
          <div className="cj-field">
            <label className="cj-label" htmlFor="cj-title">
              Title <span className="cj-required">*</span>
            </label>
            <input
              id="cj-title"
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

          {/* Domain */}
          <div className="cj-field">
            <label className="cj-label" htmlFor="cj-domain">
              Domain <span className="cj-required">*</span>
            </label>
            <select
              id="cj-domain"
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

          {/* Abstract */}
          <div className="cj-field">
            <label className="cj-label" htmlFor="cj-abstract">
              Abstract <span className="cj-required">*</span>
            </label>
            <textarea
              id="cj-abstract"
              className="cj-textarea cj-textarea--short"
              name="abstract"
              value={form.abstract}
              onChange={handleChange}
              placeholder="A concise summary of your research (max 2000 characters)"
              maxLength={2000}
              rows={4}
              required
              aria-required="true"
            />
            <span className="cj-hint">{form.abstract.length}/2000</span>
          </div>

          {/* Content */}
          <div className="cj-field">
            <label className="cj-label" htmlFor="cj-content">
              Content <span className="cj-required">*</span>
            </label>
            <textarea
              id="cj-content"
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
              id="cj-cancel-btn"
              type="button"
              className="cj-btn cj-btn--ghost"
              onClick={() => navigate("/my-journals")}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              id="cj-submit-btn"
              type="submit"
              className="cj-btn cj-btn--primary"
              disabled={loading}
            >
              {loading ? "Saving…" : "Save as Draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
