import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { currentUser, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <header style={{ borderBottom: "1px solid #e4e4e7", backgroundColor: "#ffffff" }}>
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "1rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <Link
            to="/"
            style={{
              fontSize: "1.25rem",
              fontWeight: "700",
              color: "#18181b",
              textDecoration: "none",
              letterSpacing: "-0.025em",
            }}
          >
            SCION
          </Link>
          <nav style={{ display: "flex", gap: "1rem" }}>
            <Link to="/" style={{ color: "#52525b", textDecoration: "none", fontSize: "0.95rem" }}>
              Home
            </Link>
            {isAuthenticated && (currentUser.role === "AUTHOR" || currentUser.role === "ROOT") && (
              <Link to="/author" style={{ color: "#52525b", textDecoration: "none", fontSize: "0.95rem" }}>
                Author Dashboard
              </Link>
            )}
            {isAuthenticated && currentUser.role === "ROOT" && (
              <Link to="/root" style={{ color: "#52525b", textDecoration: "none", fontSize: "0.95rem" }}>
                Root Dashboard
              </Link>
            )}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {isAuthenticated ? (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontSize: "0.875rem", color: "#3f3f46" }}>
                {currentUser.name}
                <span
                  style={{
                    marginLeft: "0.5rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    backgroundColor:
                      currentUser.role === "ROOT"
                        ? "#fef3c7"
                        : currentUser.role === "AUTHOR"
                        ? "#e0e7ff"
                        : "#f3f4f6",
                    color:
                      currentUser.role === "ROOT"
                        ? "#b45309"
                        : currentUser.role === "AUTHOR"
                        ? "#4338ca"
                        : "#4b5563",
                  }}
                >
                  {currentUser.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                style={{
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "6px",
                  border: "1px solid #d4d4d8",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Link
                to="/login"
                style={{
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.875rem",
                  color: "#18181b",
                  textDecoration: "none",
                  border: "1px solid #d4d4d8",
                  borderRadius: "6px",
                }}
              >
                Sign In
              </Link>
              <Link
                to="/register"
                style={{
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.875rem",
                  color: "#ffffff",
                  backgroundColor: "#2563eb",
                  textDecoration: "none",
                  borderRadius: "6px",
                }}
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
