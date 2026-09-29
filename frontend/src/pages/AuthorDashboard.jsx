import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AuthorDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "1.5rem" }}>
      <h1>Author Dashboard</h1>
      <p>
        Welcome, <strong>{currentUser?.name}</strong> ({currentUser?.role})
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          marginTop: "1.5rem",
        }}
      >
        {/* My Journals */}
        <div
          style={{
            padding: "1.5rem",
            background: "rgba(129,140,248,0.07)",
            border: "1px solid rgba(129,140,248,0.2)",
            borderRadius: "12px",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem", color: "#e2e8f0" }}>My Journals</h3>
          <p style={{ fontSize: "0.88rem", color: "#94a3b8", margin: "0 0 1rem" }}>
            View, edit, and publish your journal entries.
          </p>
          <button
            id="goto-my-journals-btn"
            onClick={() => navigate("/my-journals")}
            style={{
              background: "linear-gradient(135deg,#818cf8,#6366f1)",
              color: "#fff",
              border: "none",
              padding: "0.5rem 1.1rem",
              borderRadius: "7px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            Go to My Journals
          </button>
        </div>

        {/* Create Journal */}
        <div
          style={{
            padding: "1.5rem",
            background: "rgba(34,197,94,0.06)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: "12px",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem", color: "#e2e8f0" }}>New Journal</h3>
          <p style={{ fontSize: "0.88rem", color: "#94a3b8", margin: "0 0 1rem" }}>
            Start a new research journal entry saved as a draft.
          </p>
          <button
            id="create-journal-dash-btn"
            onClick={() => navigate("/journals/create")}
            style={{
              background: "rgba(34,197,94,0.15)",
              color: "#86efac",
              border: "1px solid rgba(34,197,94,0.3)",
              padding: "0.5rem 1.1rem",
              borderRadius: "7px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            Create Journal
          </button>
        </div>
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <Link to="/" style={{ color: "#818cf8", fontSize: "0.875rem" }}>
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
