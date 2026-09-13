import { useCallback, useEffect, useRef, useState } from "react";

export function useAdminToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const clearToast = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((message, type = "success") => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setToast({ id: Date.now(), message, type });
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, type === "error" ? 6000 : 4000);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  return { toast, showToast, clearToast };
}
