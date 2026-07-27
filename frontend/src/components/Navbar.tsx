import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <nav className="navbar">
      <Link to="/groups" className="brand">
        <span className="brand-mark" aria-hidden="true">S</span>
        SplitSecure
      </Link>
      <div className="links">
        <Link to="/groups">Groups</Link>
        <Link to="/profile">{user.displayName}</Link>
        <button
          className="secondary"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
