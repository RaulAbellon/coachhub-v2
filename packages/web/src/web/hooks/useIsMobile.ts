import { useEffect, useState } from "react";

export function useIsMobile(breakpoint = 768) {
  // Default false (desktop) — safe for SSR and avoids flash on iOS Safari
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check(); // run immediately after mount
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}
