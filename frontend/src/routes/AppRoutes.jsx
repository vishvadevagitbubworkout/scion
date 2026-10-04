import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import ProtectedRoute from "../components/ProtectedRoute";

import Home from "../pages/Home";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Journal from "../pages/Journal";
import AcceptInvitation from "../pages/AcceptInvitation";
import AuthorDashboard from "../pages/AuthorDashboard";
import RootDashboard from "../pages/RootDashboard";
import MyJournals from "../pages/MyJournals";
import CreateJournal from "../pages/CreateJournal";
import EditJournal from "../pages/EditJournal";

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
              <Route path="/accept-invitation" element={<AcceptInvitation />} />

              {/* Author Protected Routes (AUTHOR and ROOT) */}
              <Route
                path="/author"
                element={
                  <ProtectedRoute allowedRoles={["AUTHOR", "ROOT"]}>
                    <AuthorDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-journals"
                element={
                  <ProtectedRoute allowedRoles={["AUTHOR", "ROOT"]}>
                    <MyJournals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/journals/create"
                element={
                  <ProtectedRoute allowedRoles={["AUTHOR", "ROOT"]}>
                    <CreateJournal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/journals/edit/:id"
                element={
                  <ProtectedRoute allowedRoles={["AUTHOR", "ROOT"]}>
                    <EditJournal />
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