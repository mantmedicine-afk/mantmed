import { useEffect, useRef } from "react";

export const POLL_MS = 20000;

export const usePoll = (fn, deps = [], ms = POLL_MS) => {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ref.current();
    const t = setInterval(() => { if (!document.hidden) ref.current(); }, ms);
    return () => clearInterval(t);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
};
