import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function TotpVerifyPage() {
  const { loginTotp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mfaTicket = (location.state as { mfaTicket?: string } | null)?.mfaTicket;
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!mfaTicket) navigate("/login", { replace: true });
  }, [mfaTicket, navigate]);

  if (!mfaTicket) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginTotp(mfaTicket!, code);
      navigate("/groups");
    } catch {
      setError("Invalid or expired code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420, marginTop: 60 }}>
      <h1>Enter your authenticator code</h1>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label htmlFor="code">6-digit code</label>
            <input
              id="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Verifying..." : "Verify"}
          </button>
        </form>
      </div>
    </div>
  );
}
