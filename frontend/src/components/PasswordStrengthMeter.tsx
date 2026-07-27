interface Props {
  password: string;
  email?: string;
}

// Client-side feedback only - purely UX (show the user where they stand
// as they type). The real enforcement is server-side (auth.schema.ts),
// which this deliberately mirrors so the meter never promises "strong
// enough" for something the server would then reject.
function scorePassword(password: string, email?: string): { score: number; label: string; issues: string[] } {
  const issues: string[] = [];

  if (password.length < 12) issues.push("At least 12 characters");
  if (!/[a-z]/.test(password)) issues.push("A lowercase letter");
  if (!/[A-Z]/.test(password)) issues.push("An uppercase letter");
  if (!/[0-9]/.test(password)) issues.push("A digit");
  if (!/[^a-zA-Z0-9]/.test(password)) issues.push("A symbol");

  const emailLocalPart = email?.split("@")[0]?.toLowerCase();
  if (emailLocalPart && password.toLowerCase().includes(emailLocalPart)) {
    issues.push("Must not contain your email address");
  }

  let variety = 0;
  if (/[a-z]/.test(password)) variety++;
  if (/[A-Z]/.test(password)) variety++;
  if (/[0-9]/.test(password)) variety++;
  if (/[^a-zA-Z0-9]/.test(password)) variety++;

  const lengthScore = Math.min(password.length / 16, 1);
  const rawScore = issues.length === 0 ? Math.min(1, lengthScore * 0.6 + (variety / 4) * 0.4) : (variety / 4) * 0.4;

  const score = password.length === 0 ? 0 : Math.max(0.15, rawScore);
  const label = password.length === 0 ? "" : score < 0.4 ? "Weak" : score < 0.75 ? "Fair" : "Strong";

  return { score, label, issues };
}

export function PasswordStrengthMeter({ password, email }: Props) {
  if (!password) return null;

  const { score, label, issues } = scorePassword(password, email);
  const color = score < 0.4 ? "var(--danger)" : score < 0.75 ? "#d97706" : "var(--success)";

  return (
    <div style={{ marginTop: 6 }} aria-live="polite">
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.round(score * 100)}%`,
            background: color,
            transition: "width 150ms ease",
          }}
        />
      </div>
      <div className="hint" style={{ color, fontWeight: 600, marginTop: 4 }}>
        {label}
      </div>
      {issues.length > 0 && (
        <ul className="hint" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
