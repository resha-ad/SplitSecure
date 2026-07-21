import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { authApi, usersApi } from "../api/endpoints";

export function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpMsg, setTotpMsg] = useState<string | null>(null);

  if (!user) return null;

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    await usersApi.updateMe(displayName);
    await refreshProfile();
    setSavedMsg("Saved.");
    setTimeout(() => setSavedMsg(null), 2000);
  }

  async function onBeginTotpSetup() {
    const { qrDataUrl } = await authApi.totpSetup();
    setQrDataUrl(qrDataUrl);
    setTotpMsg(null);
  }

  async function onConfirmTotp(e: FormEvent) {
    e.preventDefault();
    try {
      await authApi.totpConfirm(totpCode);
      setQrDataUrl(null);
      setTotpCode("");
      setTotpMsg("Two-factor authentication enabled.");
      await refreshProfile();
    } catch {
      setTotpMsg("Invalid code - please check your authenticator app and try again.");
    }
  }

  return (
    <div className="app-shell">
      <h1>Profile</h1>

      <div className="card">
        <h2>Account details</h2>
        <form onSubmit={onSaveProfile}>
          <div className="form-field">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Email</label>
            <input value={user.email} disabled />
          </div>
          <button type="submit">Save</button>
          {savedMsg && <span className="hint" style={{ marginLeft: 10 }}>{savedMsg}</span>}
        </form>
      </div>

      <div className="card">
        <h2>Two-factor authentication (TOTP)</h2>
        {user.totpEnabled ? (
          <p>Two-factor authentication is <strong>enabled</strong> on your account.</p>
        ) : qrDataUrl ? (
          <div>
            <p className="hint">Scan this QR code with an authenticator app, then enter the 6-digit code it shows.</p>
            <img src={qrDataUrl} alt="TOTP QR code" style={{ margin: "12px 0" }} />
            <form onSubmit={onConfirmTotp}>
              <div className="form-field">
                <label htmlFor="totpCode">6-digit code</label>
                <input
                  id="totpCode"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  required
                />
              </div>
              <button type="submit">Confirm and enable</button>
            </form>
            {totpMsg && <p className="hint">{totpMsg}</p>}
          </div>
        ) : (
          <div>
            <p className="hint">Two-factor authentication is not yet enabled.</p>
            <button onClick={onBeginTotpSetup}>Set up authenticator app</button>
          </div>
        )}
      </div>
    </div>
  );
}
