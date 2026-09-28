import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AuthorDashboard() {
  const { currentUser } = useAuth();

  return (
    <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "1.5rem" }}>
      <h1>Author Dashboard</h1>
      <p>Welcome, <strong>{currentUser?.name}</strong> ({currentUser?.role})</p>
      <div style={{ padding: "1rem", backgroundColor: "#f4f4f5", borderRadius: "8px", marginTop: "1rem" }}>
        <h3>Author Workspace</h3>
        <p>This is the protected author area. In Phase 2, journal creation and editing will be accessible here.</p>
      </div>
      <div style={{ marginTop: "1.5rem" }}>
        <Link to="/">Back to Home</Link>
      </div>
    </div>
  );
}
