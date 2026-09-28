import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function RootDashboard() {
  const { currentUser } = useAuth();

  return (
    <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "1.5rem" }}>
      <h1>Root Administrator Dashboard</h1>
      <p>Welcome, <strong>{currentUser?.name}</strong> ({currentUser?.role})</p>
      <div style={{ padding: "1rem", backgroundColor: "#fef3c7", borderRadius: "8px", marginTop: "1rem", border: "1px solid #f59e0b" }}>
        <h3>Platform Administration</h3>
        <p>This is the protected root administration area. Accessible only to ROOT role.</p>
        <p>In later phases, author invitations, domain management, and platform oversight will be configured here.</p>
      </div>
      <div style={{ marginTop: "1.5rem" }}>
        <Link to="/">Back to Home</Link>
      </div>
    </div>
  );
}
