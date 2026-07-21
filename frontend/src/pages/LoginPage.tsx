import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.mfaTicket) {
        navigate("/login/totp", { state: { mfaTicket: result.mfaTicket } });
      } else {
        navigate("/groups");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        setError("Account temporarily locked due to repeated failed attempts. Try again shortly.");
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420, marginTop: 60 }}>
      <h1>Sign in</h1>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div style={{ marginTop: 14 }}>
          <a href={`${API_URL}/api/auth/google`}>
            <button type="button" className="secondary" style={{ width: "100%" }}>
              Continue with Google
            </button>
          </a>
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
