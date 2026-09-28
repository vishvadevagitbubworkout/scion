import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { register, login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim() || !email.trim() || !password) {
      setError("All fields are required.");
      return;
    }

    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters long.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      await register({ name, email, password });
      setSuccess("Account created successfully! Logging you in...");

      // Automatically log the new user in to establish session
      await login({ email, password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to create account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "420px", margin: "3rem auto", padding: "2rem", border: "1px solid #e4e4e7", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
      <h2 style={{ marginBottom: "1.5rem", textAlign: "center" }}>Create Your Scion Account</h2>

      {error && (
        <div style={{ backgroundColor: "#fee2e2", border: "1px solid #ef4444", color: "#b91c1c", padding: "0.75rem", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ backgroundColor: "#dcfce7", border: "1px solid #22c55e", color: "#15803d", padding: "0.75rem", borderRadius: "6px", marginBottom: "1rem", fontSize: "0.875rem" }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor="name" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
            Full Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid #d4d4d8", boxSizing: "border-box" }}
            placeholder="Jane Doe"
          />
        </div>

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

        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid #d4d4d8", boxSizing: "border-box" }}
            placeholder="At least 8 characters"
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="confirmPassword" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid #d4d4d8", boxSizing: "border-box" }}
            placeholder="Repeat your password"
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
          {submitting ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      <div style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", color: "#71717a" }}>
        Already have an account?{" "}
        <Link to="/login" style={{ color: "#2563eb", textDecoration: "none", fontWeight: "500" }}>
          Sign in
        </Link>
      </div>
    </div>
  );
}