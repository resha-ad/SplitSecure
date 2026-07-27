import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { authApi, usersApi } from "../api/endpoints";
import { setAccessToken, ApiError } from "../api/client";
import { PasswordStrengthMeter } from "../components/PasswordStrengthMeter";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function ProfilePage() {
  useDocumentTitle("Profile");
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpMsg, setTotpMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordChanging, setPasswordChanging] = useState(false);

  const [dataMsg, setDataMsg] = useState<string | null>(null);

  if (!user) return null;

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    await usersApi.updateMe(displayName);
    await refreshProfile();
    setSavedMsg("Saved.");
    setTimeout(() => setSavedMsg(null), 2000);
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    setPasswordChanging(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      // The server just revoked every session (including this one) as
      // part of the change - clear local state and force a fresh login
      // with the new password rather than pretending this tab is still
      // authenticated.
      setAccessToken(null);
      navigate("/login", { state: { passwordChanged: true } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setPasswordMsg("Current password is incorrect.");
        else if (err.status === 400) setPasswordMsg("That password can't be used - check it's new, strong enough, and not one you've used recently.");
        else setPasswordMsg("Could not change password. Please try again.");
      } else {
        setPasswordMsg("Could not change password. Please try again.");
      }
    } finally {
      setPasswordChanging(false);
    }
  }

  async function onExportData() {
    setDataMsg(null);
    const bundle = await usersApi.exportData();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "splitsecure-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFileSelected(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    setDataMsg(null);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      await usersApi.importData(bundle);
      await refreshProfile();
      setDataMsg("Import complete - your display name has been updated from the file.");
    } catch {
      setDataMsg("Could not import that file - check it's a SplitSecure export (or a valid JSON file with a profile.displayName field).");
    } finally {
      e.currentTarget.value = "";
    }
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
        <h2>Change password</h2>
        {passwordMsg && <div className="error-banner">{passwordMsg}</div>}
        <form onSubmit={onChangePassword}>
          <div className="form-field">
            <label htmlFor="currentPassword">Current password</label>
            <input
              id="currentPassword"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <PasswordStrengthMeter password={newPassword} email={user.email} />
          </div>
          <button type="submit" disabled={passwordChanging}>
            {passwordChanging ? "Changing..." : "Change password"}
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            Changing your password signs you out everywhere else, and can't reuse your last 5 passwords.
          </p>
        </form>
      </div>

      <div className="card">
        <h2>Your data</h2>
        {dataMsg && <p className="hint">{dataMsg}</p>}
        <p className="hint">
          Download everything SplitSecure holds about you - your profile, groups, expenses you're
          involved in, and settlements. You can re-upload a previous export to restore your display
          name (financial records are not re-imported, to protect ledger integrity).
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="secondary" onClick={onExportData}>Export my data</button>
          <label className="secondary" style={{ display: "inline-block", padding: "9px 16px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer" }}>
            Import from file
            <input type="file" accept="application/json" onChange={onImportFileSelected} style={{ display: "none" }} />
          </label>
        </div>
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
