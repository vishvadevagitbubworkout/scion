import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please fill in both email and password.");
      return;
    }

    try {
      setSubmitting(true);
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Failed to log in. Please check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "420px", margin: "3rem auto", padding: "2rem", border: "1px solid #e4e4e7", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
      <h2 style={{ marginBottom: "1.5rem", textAlign: "center" }}>Sign In to Scion</h2>

      {error && (
        <div style={{ backgroundColor: "#fee2e2", border: "1px solid #ef4444", color: "#b91c1c", padding: "0.75rem", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor="email" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid #d4d4d8", boxSizing: "border-box" }}
            placeholder="you@example.com"
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid #d4d4d8", boxSizing: "border-box" }}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "0.75rem",
            backgroundColor: submitting ? "#9ca3af" : "#2563eb",
            color: "#ffffff",
            fontWeight: "600",
            borderRadius: "6px",
            border: "none",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", color: "#71717a" }}>
        Don't have an account?{" "}
        <Link to="/register" style={{ color: "#2563eb", textDecoration: "none", fontWeight: "500" }}>
          Create an account
        </Link>
      </div>
    </div>
  );
}