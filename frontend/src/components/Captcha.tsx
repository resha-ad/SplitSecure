import { useEffect, useRef } from "react";

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        container: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITEKEY ?? "10000000-ffff-ffff-ffff-000000000001";

interface Props {
  onToken: (token: string | null) => void;
}

// Renders imperatively via window.hcaptcha rather than the "just drop a
// <div class='h-captcha'>" auto-render mode - auto-render only scans the
// DOM once on script load, which misses this div entirely on client-side
// route navigations (React Router doesn't reload the page), so the widget
// would silently never appear after the first visit.
export function Captcha({ onToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function render() {
      if (cancelled || !containerRef.current || !window.hcaptcha || widgetId.current !== null) return;
      widgetId.current = window.hcaptcha.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(null),
      });
    }

    if (window.hcaptcha) {
      render();
    } else {
      // The api.js script loads async - poll briefly rather than assuming
      // it's ready, since there's no reliable single "loaded" event exposed.
      const interval = setInterval(render, 200);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }
  }, [onToken]);

  return <div ref={containerRef} />;
}
