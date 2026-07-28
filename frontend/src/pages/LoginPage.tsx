import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { Captcha } from "../components/Captcha";
import { AuthIntroPanel } from "../components/AuthIntroPanel";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function LoginPage() {
  useDocumentTitle("Sign in");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const passwordChanged = Boolean((location.state as { passwordChanged?: boolean } | null)?.passwordChanged);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!captchaToken) {
      setError("Please complete the CAPTCHA.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email, password, captchaToken);
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
    <div className="split-auth">
      <AuthIntroPanel heading="Welcome back" tagline="Split expenses with the people you trust, without trusting the app blindly." />
      <div className="form-panel">
        <div className="auth-form-inner">
          <h2 style={{ fontSize: 22, marginBottom: 18 }}>Sign in to your account</h2>
          {passwordChanged && !error && <div className="success-banner">Password changed. Please sign in again.</div>}
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
            <div className="form-field">
              <Captcha onToken={setCaptchaToken} />
            </div>
            <button type="submit" disabled={submitting} style={{ width: "100%" }}>
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
    </div>
  );
}
