import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import invitationService from "../services/invitationService";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { setAuthenticatedUser } = useAuth();

  // Stages: 'validating' | 'invalid' | 'setup'
  const [stage, setStage] = useState("validating");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  // Setup form state
  const [setupToken, setSetupToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkToken() {
      if (!token) {
        if (isMounted) {
          setStage("invalid");
          setError("No invitation token was found in the URL. Please verify your link.");
        }
        return;
      }

      try {
        const data = await invitationService.validateInvitation(token);
        if (isMounted) {
          setEmail(data.email);
          setSetupToken(data.setupToken);
          setStage("setup");
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setStage("invalid");
          setError(
            err.message ||
              "This invitation is invalid, expired, or has already been used."
          );
        }
      }
    }

    checkToken();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleCompleteSetup = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername || trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters long.");
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      setError("Username can only contain letters, numbers, underscores, dots, and hyphens.");
      return;
    }

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const data = await invitationService.completeSetup({
        setupToken,
        username: trimmedUsername,
        password,
        confirmPassword,
      });

      if (data.user) {
        setAuthenticatedUser(data.user);
        navigate("/author", {
          state: { message: "Welcome to Scion! Your Author account is ready." },
        });
      }
    } catch (err) {
      setError(
        err.message ||
          "Failed to complete account setup. Your setup token or invitation may have expired."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: "520px",
        margin: "3rem auto",
        padding: "2rem",
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
        border: "1px solid #e2e8f0",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "700", color: "#0f172a", marginBottom: "0.25rem" }}>
          Author Invitation Setup
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.9rem", margin: 0 }}>
          {stage === "validating" && "Verifying your invitation link..."}
          {stage === "setup" && "Create your Author account"}
          {stage === "invalid" && "Invitation Issue"}
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "0.85rem 1rem",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: "8px",
            fontSize: "0.875rem",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Stage: Validating */}
      {stage === "validating" && (
        <div style={{ textAlign: "center", padding: "2rem 0", color: "#64748b" }}>
          <p>Validating invitation security credentials...</p>
        </div>
      )}

      {/* Stage: Invalid / Expired / Revoked */}
      {stage === "invalid" && (
        <div style={{ textAlign: "center", padding: "1rem 0" }}>
          <p style={{ color: "#475569", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
            This invitation link is invalid, has expired after 2 hours, or was already used. Please request a new invitation from an author or administrator.
          </p>
          <Link
            to="/"
            style={{
              display: "inline-block",
              padding: "0.5rem 1.25rem",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              textDecoration: "none",
              borderRadius: "6px",
              fontWeight: "600",
              fontSize: "0.875rem",
            }}
          >
            Return to Home
          </Link>
        </div>
      )}

      {/* Stage: Setup Form */}
      {stage === "setup" && (
        <form onSubmit={handleCompleteSetup}>
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "6px",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
              color: "#166534",
            }}
          >
            Invitation verified! Complete your AUTHOR account registration below.
          </div>

          {/* Invited Email (Pre-filled and read-only) */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              htmlFor="invited-email"
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: "600",
                color: "#334155",
                marginBottom: "0.35rem",
              }}
            >
              Invited Email (Read-only)
            </label>
            <input
              id="invited-email"
              type="email"
              value={email}
              disabled
              readOnly
              style={{
                width: "100%",
                padding: "0.6rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#f1f5f9",
                color: "#475569",
                fontSize: "0.9rem",
                boxSizing: "border-box",
                cursor: "not-allowed",
              }}
            />
          </div>

          {/* Username */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              htmlFor="author-username"
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: "600",
                color: "#334155",
                marginBottom: "0.35rem",
              }}
            >
              Username
            </label>
            <input
              id="author-username"
              type="text"
              placeholder="e.g. janesmith"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
              style={{
                width: "100%",
                padding: "0.6rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#64748b" }}>
              3–30 characters. Letters, numbers, underscores, dots, hyphens.
            </p>
          </div>

          {/* Password */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              htmlFor="author-password"
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: "600",
                color: "#334155",
                marginBottom: "0.35rem",
              }}
            >
              Password
            </label>
            <input
              id="author-password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              style={{
                width: "100%",
                padding: "0.6rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="confirm-password"
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: "600",
                color: "#334155",
                marginBottom: "0.35rem",
              }}
            >
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              style={{
                width: "100%",
                padding: "0.6rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: loading ? "#94a3b8" : "#16a34a",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "0.95rem",
            }}
          >
            {loading ? "Creating Author Account..." : "Create Account & Enter Dashboard"}
          </button>
        </form>
      )}
    </div>
  );
}
