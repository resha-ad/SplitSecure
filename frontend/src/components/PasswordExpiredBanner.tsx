import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function PasswordExpiredBanner() {
  const { user, passwordExpired, dismissPasswordExpiredNotice } = useAuth();

  if (!user || !passwordExpired) return null;

  return (
    <div className="error-banner" style={{ margin: "0 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span>Your password is over 90 days old. For your account's security, please change it.</span>
      <span style={{ display: "flex", gap: 10 }}>
        <Link to="/profile">Change password</Link>
        <button className="secondary" onClick={dismissPasswordExpiredNotice}>
          Dismiss
        </button>
      </span>
    </div>
  );
}
