import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import InviteAuthorCard from "../components/InviteAuthorCard";

export default function AuthorDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", color: "#0f172a" }}>Author Dashboard</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.9rem" }}>
            Welcome, <strong>{currentUser?.name}</strong> ({currentUser?.role})
          </p>
        </div>
        <Link
          to="/"
          style={{
            padding: "0.45rem 0.9rem",
            backgroundColor: "#f1f5f9",
            color: "#334155",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "0.85rem",
            fontWeight: "600",
          }}
        >
          ← Home
        </Link>
      </div>

      {/* Journal Quick Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          marginBottom: "2rem",
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
          <h3 style={{ margin: "0 0 0.5rem", color: "#1e293b" }}>My Journals</h3>
          <p style={{ fontSize: "0.88rem", color: "#64748b", margin: "0 0 1rem" }}>
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
          <h3 style={{ margin: "0 0 0.5rem", color: "#1e293b" }}>New Journal</h3>
          <p style={{ fontSize: "0.88rem", color: "#64748b", margin: "0 0 1rem" }}>
            Start a new research journal entry saved as a draft.
          </p>
          <button
            id="create-journal-dash-btn"
            onClick={() => navigate("/journals/create")}
            style={{
              background: "#16a34a",
              color: "#ffffff",
              border: "none",
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

      {/* Author Invitation Section (Authors can invite unlimited other authors) */}
      <InviteAuthorCard />
    </div>
  );
}
