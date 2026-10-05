import { useState } from "react";
import invitationService from "../services/invitationService";

export default function InviteAuthorCard({ onInvitationCreated }) {
  // Steps: 'email' | 'otp' | 'verified' | 'sent'
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remainingAttempts, setRemainingAttempts] = useState(null);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");
    setRemainingAttempts(null);

    try {
      await invitationService.sendOtp({ email: email.trim() });
      setStep("otp");
    } catch (err) {
      setError(err.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      setError("Please enter a valid 6-digit OTP.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await invitationService.verifyOtp({
        email: email.trim(),
        otp: otp.trim(),
      });
      setVerificationToken(data.verificationToken);
      setStep("verified");
    } catch (err) {
      setError(err.message || "Invalid OTP.");
      if (err.data && err.data.remainingAttempts !== undefined) {
        setRemainingAttempts(err.data.remainingAttempts);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async () => {
    setLoading(true);
    setError("");

    try {
      await invitationService.createInvitation({
        email: email.trim(),
        verificationToken,
      });
      setStep("sent");
      if (onInvitationCreated) {
        onInvitationCreated();
      }
    } catch (err) {
      setError(err.message || "Failed to send invitation.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep("email");
    setEmail("");
    setOtp("");
    setVerificationToken("");
    setError("");
    setRemainingAttempts(null);
  };

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "10px",
        border: "1px solid #e2e8f0",
        padding: "1.5rem",
        marginBottom: "2rem",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
      }}
    >
      <h2 style={{ fontSize: "1.2rem", color: "#1e293b", margin: "0 0 0.5rem" }}>
        Invite New Author
      </h2>
      <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 1.25rem" }}>
        Verify the invitee's email with an OTP, then send an invitation link. Invitations expire in exactly 2 hours.
      </p>

      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: "6px",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {error}
          {remainingAttempts !== null && (
            <div style={{ marginTop: "0.25rem", fontWeight: "600" }}>
              {remainingAttempts} attempt(s) remaining.
            </div>
          )}
        </div>
      )}

      {/* Step 1: Enter Email & Send OTP */}
      {step === "email" && (
        <form onSubmit={handleSendOtp} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <input
            type="email"
            placeholder="invitee@institution.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              flex: 1,
              padding: "0.65rem 0.9rem",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "0.9rem",
            }}
          />
          <button
            type="submit"
            disabled={loading || !email.trim()}
            style={{
              padding: "0.65rem 1.25rem",
              backgroundColor: loading || !email.trim() ? "#94a3b8" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              cursor: loading || !email.trim() ? "not-allowed" : "pointer",
              fontSize: "0.9rem",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Sending OTP..." : "Send OTP"}
          </button>
        </form>
      )}

      {/* Step 2: Enter OTP */}
      {step === "otp" && (
        <div>
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "6px",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              color: "#1e40af",
            }}
          >
            A 6-digit verification code has been sent to <strong>{email}</strong>. Enter it below to verify the email address.
          </div>

          <form onSubmit={handleVerifyOtp} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <input
              type="text"
              maxLength={6}
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
              style={{
                width: "200px",
                padding: "0.65rem 0.9rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "1rem",
                letterSpacing: "0.2rem",
                textAlign: "center",
                fontWeight: "700",
              }}
            />
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              style={{
                padding: "0.65rem 1.25rem",
                backgroundColor: loading || otp.length !== 6 ? "#94a3b8" : "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontWeight: "600",
                cursor: loading || otp.length !== 6 ? "not-allowed" : "pointer",
                fontSize: "0.9rem",
              }}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: "0.65rem 1rem",
                backgroundColor: "#f8fafc",
                color: "#64748b",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Change Email
            </button>
          </form>
        </div>
      )}

      {/* Step 3: Verified - Ready to Send Invitation */}
      {step === "verified" && (
        <div>
          <div
            style={{
              padding: "0.85rem 1rem",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "6px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
              color: "#166534",
            }}
          >
            ✓ <strong>{email}</strong> has been successfully verified! Click "Send Invite" to deliver the 2-hour invitation link to the author.
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={handleSendInvite}
              disabled={loading}
              style={{
                padding: "0.65rem 1.5rem",
                backgroundColor: loading ? "#94a3b8" : "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "0.9rem",
              }}
            >
              {loading ? "Sending Invitation..." : "Send Invite"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: "0.65rem 1rem",
                backgroundColor: "#f8fafc",
                color: "#64748b",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Invitation Sent Success */}
      {step === "sent" && (
        <div>
          <div
            style={{
              padding: "1rem",
              backgroundColor: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "6px",
              marginBottom: "1rem",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem", color: "#166534", fontSize: "1rem" }}>
              ✓ Invitation Delivered
            </h3>
            <p style={{ margin: "0 0 0.5rem", color: "#15803d", fontSize: "0.875rem" }}>
              An invitation email has been sent to <strong>{email}</strong>.
            </p>
            <p style={{ margin: 0, color: "#166534", fontSize: "0.8rem", fontWeight: "600" }}>
              ⚠️ The invitation link expires in exactly 2 hours.
            </p>
          </div>

          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: "0.55rem 1.1rem",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Invite Another Author
          </button>
        </div>
      )}
    </div>
  );
}
