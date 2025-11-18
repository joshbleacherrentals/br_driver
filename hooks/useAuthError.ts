import { useState } from "react";

export const extractClerkMessages = (err: unknown): string[] => {
  try {
    if (err && typeof err === "object") {
      const anyErr = err as any;
      if (Array.isArray(anyErr?.errors)) {
        const msgs = anyErr.errors.map((e: any) => e?.longMessage || e?.message).filter(Boolean);
        if (msgs.length) return msgs as string[];
      }
      if (typeof anyErr?.message === "string") {
        return [anyErr.message];
      }
    }
    if (err instanceof Error && err.message) return [err.message];
  } catch {}
  return ["Something went wrong. Please try again."];
};

export const useAuthError = () => {
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const showError = (err: unknown) => {
    setErrorMessages(extractClerkMessages(err));
    setErrorVisible(true);
  };

  const hideError = () => {
    setErrorVisible(false);
  };

  return {
    errorVisible,
    errorMessages,
    showError,
    hideError,
  };
};
