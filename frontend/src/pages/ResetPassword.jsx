import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import authService from "../services/authService";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [token] = useState(() => searchParams.get("token")
    || new URLSearchParams(location.hash.slice(1)).get("token")
    || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      navigate("/reset-password", { replace: true });
    }
  }, [navigate, token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await authService.completePasswordReset({ token, password, confirmPassword });
      navigate("/login", { replace: true, state: { message: "Password reset successfully. Please sign in." } });
    } catch (requestError) {
      setError(requestError.message || "Unable to reset your password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ maxWidth: "420px", margin: "3rem auto", padding: "2rem", border: "1px solid #e4e4e7", borderRadius: "8px" }}>
      <h1>Choose a new password</h1>
      {!token ? (
        <p role="alert">This password reset link is missing its token. Request a new link to continue.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <p role="alert">{error}</p>}
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{ display: "block", boxSizing: "border-box", width: "100%", margin: "0.5rem 0 1rem", padding: "0.625rem" }}
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            style={{ display: "block", boxSizing: "border-box", width: "100%", margin: "0.5rem 0 1rem", padding: "0.625rem" }}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Set new password"}
          </button>
        </form>
      )}
      <p><Link to="/forgot-password">Request a new reset link</Link></p>
      <p><Link to="/login">Return to sign in</Link></p>
    </section>
  );
}
