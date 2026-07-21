import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function OAuthCallbackPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      navigate(user ? "/groups" : "/login", { replace: true });
    }
  }, [loading, user, navigate]);

  return <div className="app-shell">Signing you in...</div>;
}
