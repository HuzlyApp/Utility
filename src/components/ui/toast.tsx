"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import { CheckIcon, AlertIcon, InfoIcon, XIcon } from "./icons";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail safe: no-op if used outside provider.
    return { toast: () => {} };
  }
  return ctx;
}

const TONE_STYLES: Record<ToastTone, { ring: string; icon: React.ReactNode }> = {
  success: {
    ring: "border-green-200",
    icon: <CheckIcon className="h-4 w-4 text-green-600" />,
  },
  error: {
    ring: "border-red-200",
    icon: <AlertIcon className="h-4 w-4 text-red-600" />,
  },
  info: {
    ring: "border-slate-200",
    icon: <InfoIcon className="h-4 w-4 text-slate-500" />,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => remove(id), 3500);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "toast-enter pointer-events-auto flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg",
              TONE_STYLES[t.tone].ring
            )}
          >
            {TONE_STYLES[t.tone].icon}
            <p className="flex-1 text-sm text-slate-800">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              aria-label="Dismiss"
              className="text-slate-400 hover:text-slate-600"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
