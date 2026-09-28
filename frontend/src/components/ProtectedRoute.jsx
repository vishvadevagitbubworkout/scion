import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * ProtectedRoute component for route protection and RBAC.
 * @param {{ allowedRoles?: string[], children?: React.ReactNode }} props
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
        <p>Loading session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return (
      <div style={{ maxWidth: "600px", margin: "4rem auto", textAlign: "center", padding: "2rem" }}>
        <h2>403 - Access Forbidden</h2>
        <p>
          Your account role (<strong>{currentUser.role}</strong>) does not have permission
          to access this page.
        </p>
      </div>
    );
  }

  return children ? children : <Outlet />;
}
