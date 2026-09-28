import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import ProtectedRoute from "../components/ProtectedRoute";

import Home from "../pages/Home";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Journal from "../pages/Journal";
import AuthorDashboard from "../pages/AuthorDashboard";
import RootDashboard from "../pages/RootDashboard";

function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <Navbar />
          <main style={{ flex: 1 }}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/journal/:id" element={<Journal />} />

              {/* Author Protected Routes (AUTHOR and ROOT) */}
              <Route
                path="/author"
                element={
                  <ProtectedRoute allowedRoles={["AUTHOR", "ROOT"]}>
                    <AuthorDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Root Protected Routes (ROOT only) */}
              <Route
                path="/root"
                element={
                  <ProtectedRoute allowedRoles={["ROOT"]}>
                    <RootDashboard />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default AppRoutes;