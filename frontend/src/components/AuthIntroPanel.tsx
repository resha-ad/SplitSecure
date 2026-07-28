interface Props {
  heading: string;
  tagline: string;
}

const FEATURES = [
  "Multi-factor authentication with an authenticator app",
  "Every balance protected against double-spending",
  "Your data encrypted, exportable, and yours alone",
];

export function AuthIntroPanel({ heading, tagline }: Props) {
  return (
    <div className="intro-panel">
      <span className="brand-mark" aria-hidden="true">S</span>
      <h1>{heading}</h1>
      <p>{tagline}</p>
      <ul>
        {FEATURES.map((feature) => (
          <li key={feature}>
            <span aria-hidden="true">&#10003;</span>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}
