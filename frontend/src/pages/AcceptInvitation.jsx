import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import invitationService from "../services/invitationService";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { setAuthenticatedUser } = useAuth();

  // Lifecycle states: 'validating' | 'invalid' | 'otp' | 'setup' | 'completed'
  const [stage, setStage] = useState("validating");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  // OTP stage state
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(null);

  // Setup stage state (setupToken is kept ONLY in React component state)
  const [setupToken, setSetupToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

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
          setStage("otp");
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

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setError("Please enter a valid 6-digit OTP code.");
      return;
    }

    setOtpLoading(true);
    setError("");

    try {
      const data = await invitationService.verifyOtp({
        token,
        otp: otp.trim(),
      });
      // Store setupToken strictly in component memory
      setSetupToken(data.setupToken);
      setStage("setup");
      setError("");
    } catch (err) {
      setError(err.message || "Failed to verify OTP.");
      if (err.data && err.data.remainingAttempts !== undefined) {
        setRemainingAttempts(err.data.remainingAttempts);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCompleteSetup = async (e) => {
    e.preventDefault();

    if (!name.trim() || name.trim().length < 2) {
      setError("Name must be at least 2 characters long.");
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

    setSetupLoading(true);
    setError("");

    try {
      const data = await invitationService.completeSetup({
        setupToken,
        name: name.trim(),
        password,
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
          "Failed to complete account setup. Your setup token may have expired."
      );
    } finally {
      setSetupLoading(false);
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
          {stage === "otp" && "Step 1 of 2: Verify Your 6-Digit OTP"}
          {stage === "setup" && "Step 2 of 2: Create Your Author Account"}
          {stage === "validating" && "Verifying your invitation link..."}
          {stage === "invalid" && "Invitation Problem"}
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
          {remainingAttempts !== null && remainingAttempts > 0 && (
            <div style={{ marginTop: "0.25rem", fontWeight: "600" }}>
              {remainingAttempts} attempt(s) remaining before invitation is revoked.
            </div>
          )}
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
            If you believe this is an error, please request a new invitation from your platform administrator.
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

      {/* Stage: Step 1 - OTP Verification */}
      {stage === "otp" && (
        <form onSubmit={handleVerifyOtp}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: "600",
                color: "#334155",
                marginBottom: "0.35rem",
              }}
            >
              Invited Email
            </label>
            <input
              type="text"
              value={email}
              disabled
              style={{
                width: "100%",
                padding: "0.6rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                backgroundColor: "#f1f5f9",
                color: "#475569",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="otp-input"
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: "600",
                color: "#334155",
                marginBottom: "0.35rem",
              }}
            >
              Enter 6-Digit OTP Code
            </label>
            <input
              id="otp-input"
              type="text"
              maxLength={6}
              placeholder="e.g. 123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
              style={{
                width: "100%",
                padding: "0.65rem 0.85rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "1.2rem",
                letterSpacing: "0.3rem",
                textAlign: "center",
                fontWeight: "700",
                color: "#0f172a",
                boxSizing: "border-box",
              }}
            />
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "#64748b" }}>
              Enter the 6-digit one-time password provided with your invitation.
            </p>
          </div>

          <button
            type="submit"
            disabled={otpLoading || otp.length !== 6}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: otpLoading || otp.length !== 6 ? "#94a3b8" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              cursor: otpLoading || otp.length !== 6 ? "not-allowed" : "pointer",
              fontSize: "0.95rem",
            }}
          >
            {otpLoading ? "Verifying OTP..." : "Verify OTP & Continue"}
          </button>
        </form>
      )}

      {/* Stage: Step 2 - Account Details Setup */}
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
            OTP verified for <strong>{email}</strong>! Please choose your author profile name and password to complete setup.
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <label
              htmlFor="author-name"
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: "600",
                color: "#334155",
                marginBottom: "0.35rem",
              }}
            >
              Full Name
            </label>
            <input
              id="author-name"
              type="text"
              placeholder="e.g. Dr. Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
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
            disabled={setupLoading}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: setupLoading ? "#94a3b8" : "#16a34a",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              cursor: setupLoading ? "not-allowed" : "pointer",
              fontSize: "0.95rem",
            }}
          >
            {setupLoading ? "Creating Author Account..." : "Complete Setup & Access Dashboard"}
          </button>
        </form>
      )}
    </div>
  );
}
