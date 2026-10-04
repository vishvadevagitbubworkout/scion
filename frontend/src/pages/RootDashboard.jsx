import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import invitationService from "../services/invitationService";

export default function RootDashboard() {
  const { currentUser } = useAuth();

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [createdInvite, setCreatedInvite] = useState(null);

  const [invitations, setInvitations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [revokingId, setRevokingId] = useState(null);

  useEffect(() => {
    loadInvitations();
  }, []);

  async function loadInvitations() {
    setLoadingList(true);
    try {
      const data = await invitationService.getInvitations();
      setInvitations(data.invitations || []);
      setListError("");
    } catch (err) {
      setListError(err.message || "Failed to load invitations.");
    } finally {
      setLoadingList(false);
    }
  }

  const handleCreateInvitation = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setInviting(true);
    setInviteError("");
    setCreatedInvite(null);

    try {
      const data = await invitationService.createInvitation({ email: email.trim() });
      setCreatedInvite(data);
      setEmail("");
      await loadInvitations();
    } catch (err) {
      setInviteError(err.message || "Failed to create invitation.");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm("Are you sure you want to revoke this invitation?")) {
      return;
    }

    setRevokingId(id);
    try {
      await invitationService.revokeInvitation(id);
      await loadInvitations();
    } catch (err) {
      alert(err.message || "Failed to revoke invitation.");
    } finally {
      setRevokingId(null);
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "PENDING":
        return { backgroundColor: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
      case "ACCEPTED":
        return { backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" };
      case "REVOKED":
        return { backgroundColor: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" };
      case "EXPIRED":
        return { backgroundColor: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" };
      default:
        return { backgroundColor: "#f3f4f6", color: "#374151" };
    }
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "2rem auto", padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", color: "#0f172a" }}>Root Administrator Dashboard</h1>
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

      {/* Author Invitation Creation Card */}
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
          Send a cryptographically secured 3-day invitation link and 6-digit OTP to grant AUTHOR privileges.
        </p>

        {inviteError && (
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
            {inviteError}
          </div>
        )}

        <form onSubmit={handleCreateInvitation} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <input
            type="email"
            placeholder="author@institution.edu"
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
            disabled={inviting || !email.trim()}
            style={{
              padding: "0.65rem 1.25rem",
              backgroundColor: inviting || !email.trim() ? "#94a3b8" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "600",
              cursor: inviting || !email.trim() ? "not-allowed" : "pointer",
              fontSize: "0.9rem",
              whiteSpace: "nowrap",
            }}
          >
            {inviting ? "Creating Invitation..." : "Send Author Invitation"}
          </button>
        </form>

        {/* Development & Simulation Credentials Box */}
        {createdInvite && (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              backgroundColor: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "8px",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem", color: "#166534", fontSize: "1rem" }}>
              ✓ Author Invitation Created
            </h3>
            <p style={{ margin: "0 0 0.75rem", color: "#15803d", fontSize: "0.85rem" }}>
              Share these credentials with the invitee to complete setup. The invitation expires in 3 days.
            </p>

            <div style={{ marginBottom: "0.75rem" }}>
              <strong style={{ fontSize: "0.8rem", color: "#334155", display: "block" }}>Invitation Link:</strong>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginTop: "0.25rem",
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/accept-invitation?token=${createdInvite.invitationToken}`}
                  style={{
                    flex: 1,
                    padding: "0.45rem 0.65rem",
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    fontSize: "0.825rem",
                    color: "#0f172a",
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}/accept-invitation?token=${createdInvite.invitationToken}`
                    )
                  }
                  style={{
                    padding: "0.45rem 0.75rem",
                    backgroundColor: "#ffffff",
                    border: "1px solid #94a3b8",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                  }}
                >
                  Copy Link
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "0.8rem", color: "#334155", display: "block" }}>6-Digit OTP:</strong>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "0.25rem",
                    fontSize: "1.25rem",
                    fontWeight: "700",
                    letterSpacing: "0.2rem",
                    color: "#166534",
                    backgroundColor: "#dcfce7",
                    padding: "0.25rem 0.75rem",
                    borderRadius: "4px",
                  }}
                >
                  {createdInvite.otp}
                </span>
              </div>
              <div>
                <strong style={{ fontSize: "0.8rem", color: "#334155", display: "block" }}>Expires:</strong>
                <span style={{ fontSize: "0.85rem", color: "#475569" }}>
                  {new Date(createdInvite.invitation.expiresAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Author Invitations Management Table */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          padding: "1.5rem",
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.2rem", color: "#1e293b", margin: 0 }}>
            All Author Invitations ({invitations.length})
          </h2>
          <button
            onClick={loadInvitations}
            disabled={loadingList}
            style={{
              padding: "0.35rem 0.75rem",
              backgroundColor: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "4px",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Refresh List
          </button>
        </div>

        {listError && (
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
            {listError}
          </div>
        )}

        {loadingList ? (
          <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Loading invitations...</p>
        ) : invitations.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "0.9rem" }}>No author invitations found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Invitee Email</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Role</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Status</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Expires</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Created</th>
                  <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: "600", color: "#0f172a" }}>
                      {inv.email}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", color: "#64748b" }}>
                      {inv.role}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.55rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          ...getStatusBadgeStyle(inv.status),
                        }}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", color: "#64748b", fontSize: "0.8rem" }}>
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", color: "#64748b", fontSize: "0.8rem" }}>
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      {inv.status === "PENDING" && (
                        <button
                          onClick={() => handleRevoke(inv.id)}
                          disabled={revokingId === inv.id}
                          style={{
                            padding: "0.3rem 0.65rem",
                            backgroundColor: "#fee2e2",
                            color: "#b91c1c",
                            border: "1px solid #fecaca",
                            borderRadius: "4px",
                            cursor: revokingId === inv.id ? "not-allowed" : "pointer",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                          }}
                        >
                          {revokingId === inv.id ? "Revoking..." : "Revoke"}
                        </button>
                      )}
                      {inv.status === "ACCEPTED" && (
                        <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: "600" }}>
                          Active Account
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
