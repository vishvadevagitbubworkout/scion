import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Home() {
  const { currentUser, isAuthenticated } = useAuth();

  return (
    <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "1.5rem" }}>
      <h1>Welcome to Scion</h1>
      <p style={{ color: "#52525b", fontSize: "1.1rem" }}>
        A modern, verified publishing and journal platform.
      </p>

      {isAuthenticated ? (
        <div style={{ marginTop: "2rem", padding: "1.5rem", border: "1px solid #e4e4e7", borderRadius: "8px", backgroundColor: "#fafafa" }}>
          <h3>Current Session</h3>
          <p><strong>Name:</strong> {currentUser.name}</p>
          <p><strong>Email:</strong> {currentUser.email}</p>
          <p><strong>Role:</strong> {currentUser.role}</p>

          <div style={{ marginTop: "1rem", display: "flex", gap: "1rem" }}>
            {(currentUser.role === "AUTHOR" || currentUser.role === "ROOT") && (
              <Link to="/author" style={{ color: "#2563eb", textDecoration: "none", fontWeight: "500" }}>
                → Go to Author Dashboard
              </Link>
            )}
            {currentUser.role === "ROOT" && (
              <Link to="/root" style={{ color: "#2563eb", textDecoration: "none", fontWeight: "500" }}>
                → Go to Root Dashboard
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "2rem", padding: "1.5rem", border: "1px solid #e4e4e7", borderRadius: "8px", backgroundColor: "#f4f4f5" }}>
          <p>You are browsing as an unauthenticated visitor.</p>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <Link to="/login" style={{ color: "#2563eb", fontWeight: "600" }}>Sign In</Link>
            <Link to="/register" style={{ color: "#2563eb", fontWeight: "600" }}>Create an Account</Link>
          </div>
        </div>
      )}
    </div>
  );
}