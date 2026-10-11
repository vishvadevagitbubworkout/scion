import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import invitationService from "../services/invitationService";

const inputStyle = {
  display: "block",
  boxSizing: "border-box",
  width: "100%",
  marginTop: "0.4rem",
  padding: "0.7rem 0.8rem",
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  font: "inherit",
};

const labelStyle = {
  display: "block",
  marginBottom: "1rem",
  color: "#334155",
  fontSize: "0.9rem",
  fontWeight: 600,
};

function getValidationFailureStage(requestError) {
  const code = requestError.data?.code;
  if (code === "INVITATION_EXPIRED") return "expired";
  if (code === "INVITATION_REVOKED") return "revoked";
  if (code === "INVITATION_ALREADY_USED") return "used";
  if (requestError.status >= 500 || !requestError.status) return "network-error";
  return "invalid";
}

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [token] = useState(() => searchParams.get("token")
    || new URLSearchParams(location.hash.slice(1)).get("token")
    || "");
  const navigate = useNavigate();
  const { setAuthenticatedUser } = useAuth();
  const [stage, setStage] = useState("validating");
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    displayName: "",
    username: "",
    password: "",
    confirmPassword: "",
    bio: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token && (location.search || location.hash)) {
      navigate("/accept-invitation", { replace: true });
    }
  }, [location.hash, location.search, navigate, token]);

  async function validateToken() {
    if (!token) {
      setStage("invalid");
      setError("No invitation token was found. Use the link from your invitation email.");
      return;
    }

    setStage("validating");
    setError("");
    try {
      const data = await invitationService.validateInvitation(token);
      setEmail(data.email);
      setStage("setup");
    } catch (requestError) {
      setStage(getValidationFailureStage(requestError));
      setError(requestError.message || "Unable to validate this invitation.");
    }
  }

  useEffect(() => {
    let isMounted = true;
    if (!token) {
      Promise.resolve().then(() => {
        if (isMounted) {
          setStage("invalid");
          setError("No invitation token was found. Use the link from your invitation email.");
        }
      });
    } else {
      invitationService.validateInvitation(token)
        .then((data) => {
          if (isMounted) {
            setEmail(data.email);
            setStage("setup");
          }
        })
        .catch((requestError) => {
          if (isMounted) {
            setStage(getValidationFailureStage(requestError));
            setError(requestError.message || "Unable to validate this invitation.");
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [token]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors([]);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setFieldErrors([]);
    setLoading(true);

    try {
      const data = await invitationService.completeSetup(form);
      setAuthenticatedUser(data.user);
      setStage("success");
      navigate("/author", {
        replace: true,
        state: { message: "Welcome to Scion! Your Author account is ready." },
      });
    } catch (requestError) {
      const code = requestError.data?.code;
      if (requestError.data?.errors) setFieldErrors(requestError.data.errors);
      if (code === "INVITATION_EXPIRED") setStage("expired");
      else if (code === "INVITATION_REVOKED") setStage("revoked");
      else if (code === "INVITATION_ALREADY_USED") setStage("used");
      else if (!requestError.status) setStage("network-error");
      setError(requestError.message || "Unable to complete account setup.");
    } finally {
      setLoading(false);
    }
  }

  const terminalStage = ["invalid", "expired", "revoked", "used"].includes(stage);

  return (
    <section style={{
      maxWidth: "560px",
      margin: "3rem auto",
      padding: "2rem",
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      boxShadow: "0 4px 12px rgb(15 23 42 / 8%)",
    }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.5rem", color: "#0f172a" }}>Accept your Author invitation</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          {stage === "validating" && "Checking the invitation with Scion..."}
          {stage === "setup" && "Complete your author profile to continue."}
          {stage === "success" && "Your account is ready."}
          {terminalStage && "This invitation cannot be used."}
          {stage === "network-error" && "Scion could not be reached."}
        </p>
      </header>

      {error && (
        <div role="alert" style={{
          marginBottom: "1rem",
          padding: "0.85rem 1rem",
          color: "#991b1b",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "8px",
        }}>
          {error}
        </div>
      )}

      {fieldErrors.length > 0 && (
        <ul role="alert" style={{ color: "#991b1b" }}>
          {fieldErrors.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}

      {stage === "validating" && <p role="status">Validating invitation...</p>}

      {stage === "network-error" && (
        <button type="button" onClick={stage === "setup" ? handleSubmit : validateToken}>
          Try again
        </button>
      )}

      {terminalStage && (
        <div>
          <p style={{ color: "#475569" }}>
            {stage === "expired" && "The invitation expired. Ask an authorized ROOT or AUTHOR to issue a new invitation."}
            {stage === "revoked" && "The inviter revoked this invitation. Ask an authorized ROOT or AUTHOR to issue a new one."}
            {stage === "used" && "This invitation has already created an account and cannot be reused."}
            {stage === "invalid" && "The link is invalid or incomplete. Ask an authorized ROOT or AUTHOR to send a new invitation."}
          </p>
          <Link to="/">Return to Scion</Link>
        </div>
      )}

      {stage === "setup" && (
        <form onSubmit={handleSubmit}>
          <p role="status" style={{
            padding: "0.8rem",
            color: "#166534",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "6px",
          }}>
            Invitation verified. Your account email is bound to this invitation.
          </p>

          <label htmlFor="invited-email" style={labelStyle}>
            Invited email
            <input
              id="invited-email"
              type="email"
              value={email}
              readOnly
              aria-readonly="true"
              style={{ ...inputStyle, background: "#f1f5f9" }}
            />
          </label>

          <label htmlFor="full-name" style={labelStyle}>
            Full name
            <input
              id="full-name"
              name="fullName"
              value={form.fullName}
              onChange={updateField}
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
              style={inputStyle}
            />
          </label>

          <label htmlFor="display-name" style={labelStyle}>
            Display name
            <input
              id="display-name"
              name="displayName"
              value={form.displayName}
              onChange={updateField}
              maxLength={60}
              required
              style={inputStyle}
            />
          </label>

          <label htmlFor="author-username" style={labelStyle}>
            Username
            <input
              id="author-username"
              name="username"
              value={form.username}
              onChange={updateField}
              autoComplete="username"
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_.-]+"
              required
              style={inputStyle}
            />
            <small style={{ color: "#64748b", fontWeight: 400 }}>
              3–30 letters, numbers, underscores, dots, or hyphens.
            </small>
          </label>

          <label htmlFor="author-bio" style={labelStyle}>
            Short bio (optional)
            <textarea
              id="author-bio"
              name="bio"
              value={form.bio}
              onChange={updateField}
              maxLength={280}
              rows={3}
              style={inputStyle}
            />
          </label>

          <label htmlFor="author-password" style={labelStyle}>
            Password
            <input
              id="author-password"
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              style={inputStyle}
            />
            <small style={{ color: "#64748b", fontWeight: 400 }}>
              Use at least 12 characters.
            </small>
          </label>

          <label htmlFor="confirm-password" style={labelStyle}>
            Confirm password
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={updateField}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              style={inputStyle}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.8rem",
              color: "#fff",
              background: loading ? "#94a3b8" : "#15803d",
              border: 0,
              borderRadius: "6px",
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Creating account..." : "Create Author account"}
          </button>
        </form>
      )}
    </section>
  );
}
