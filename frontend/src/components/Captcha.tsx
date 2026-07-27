import { useEffect, useRef } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      render: (
        container: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void }
      ) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITEKEY ?? "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

interface Props {
  onToken: (token: string | null) => void;
}

// Renders imperatively via window.grecaptcha (script loaded with
// ?render=explicit) rather than the "just drop a <div class='g-recaptcha'>"
// auto-render mode - auto-render only scans the DOM once on script load,
// which misses this div entirely on client-side route navigations (React
// Router doesn't reload the page), so the widget would silently never
// appear after the first visit.
export function Captcha({ onToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    function render() {
      if (cancelled || !containerRef.current || !window.grecaptcha || widgetId.current !== null) return;
      widgetId.current = window.grecaptcha.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(null),
      });
    }

    if (window.grecaptcha) {
      window.grecaptcha.ready(render);
    } else {
      // The api.js script loads async - poll briefly for the global rather
      // than assuming it's ready, since there's no other reliable hook
      // into "the script tag itself has finished loading."
      const interval = setInterval(() => {
        if (window.grecaptcha) {
          clearInterval(interval);
          window.grecaptcha.ready(render);
        }
      }, 200);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }
  }, [onToken]);

  return <div ref={containerRef} />;
}
