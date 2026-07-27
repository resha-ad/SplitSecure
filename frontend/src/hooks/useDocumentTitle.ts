import { useEffect } from "react";

// Distinct titles per route help screen-reader users confirm navigation
// succeeded (announced on route change) without having to read page
// content - a single static title across the whole SPA is a common
// accessibility gap in client-rendered apps.
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} - SplitSecure`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
