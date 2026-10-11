import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { currentUser, logout, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      setMenuOpen(false);
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="site-header">
      <div className="nav-inner">
        <Link className="brand" to="/" onClick={closeMenu} aria-label="Scion home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SCION<span className="brand-period">.</span></span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span /><span />
        </button>

        <nav
          className={`primary-navigation${menuOpen ? " primary-navigation-open" : ""}`}
          id="primary-navigation"
          aria-label="Main navigation"
        >
          <Link to="/" onClick={closeMenu}>Journal</Link>
          <a href="/#discover" onClick={closeMenu}>Explore</a>
          {isAuthenticated && (currentUser?.role === "AUTHOR" || currentUser?.role === "ROOT") && (
            <Link to="/author" onClick={closeMenu}>Workspace</Link>
          )}
          {isAuthenticated && currentUser?.role === "ROOT" && (
            <Link to="/root" onClick={closeMenu}>Administration</Link>
          )}
          <div className="nav-account">
            {isAuthenticated ? (
              <>
                <span className="nav-user">{currentUser?.displayName || currentUser?.name}</span>
                <button type="button" className="nav-signout" onClick={handleLogout}>Sign out</button>
              </>
            ) : (
              <>
                <Link className="nav-signin" to="/login" onClick={closeMenu}>Sign in</Link>
                <Link className="nav-join" to="/register" onClick={closeMenu}>Join Scion <span aria-hidden="true">↗</span></Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
