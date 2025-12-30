import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mountain, LogOut, User, Trophy } from "lucide-react";
import "./Navbar.css";

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <Mountain className="navbar-logo" />
          <span className="brand-text">Fantasy Climbing</span>
        </Link>

        <div className="navbar-links">
          {user ? (
            <>
              <Link to="/leagues" className="navbar-link">
                <Trophy size={18} />
                <span className="link-text">My Leagues</span>
              </Link>
              <div className="navbar-user">
                <User size={18} />
                <span className="user-text">{user.username || user.email}</span>
              </div>
              <button onClick={handleSignOut} className="btn btn-ghost">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                Sign In
              </Link>
              <Link to="/signup" className="btn btn-primary">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
