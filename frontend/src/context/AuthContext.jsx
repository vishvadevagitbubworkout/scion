import { createContext, useState, useEffect } from "react";
import authService from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const data = await authService.getCurrentUser();
        if (isMounted && data && data.user) {
          setCurrentUser(data.user);
        }
      } catch {
        if (isMounted) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials) => {
    setAuthError(null);
    try {
      const data = await authService.login(credentials);
      setCurrentUser(data.user);
      return data.user;
    } catch (err) {
      setAuthError(err.message || "Failed to log in");
      throw err;
    }
  };

  const register = async (userData) => {
    setAuthError(null);
    try {
      const data = await authService.register(userData);
      return data;
    } catch (err) {
      setAuthError(err.message || "Failed to register");
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setCurrentUser(null);
      setAuthError(null);
    }
  };

  const value = {
    currentUser,
    loading,
    authError,
    isAuthenticated: !!currentUser,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
