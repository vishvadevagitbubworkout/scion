import { useState } from "react";
import { Link } from "react-router-dom";
import authService from "../services/authService";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);
    try {
      const result = await authService.requestPasswordReset({ email });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message || "Unable to request password recovery.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ maxWidth: "420px", margin: "3rem auto", padding: "2rem", border: "1px solid #e4e4e7", borderRadius: "8px" }}>
      <h1>Reset your password</h1>
      <p>Enter the email address associated with your Scion account.</p>
      {message && <p role="status" aria-live="polite">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <form onSubmit={handleSubmit}>
        <label htmlFor="recovery-email">Email</label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={{ display: "block", boxSizing: "border-box", width: "100%", margin: "0.5rem 0 1rem", padding: "0.625rem" }}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Requesting..." : "Send recovery instructions"}
        </button>
      </form>
      <p><Link to="/login">Return to sign in</Link></p>
    </section>
  );
}
