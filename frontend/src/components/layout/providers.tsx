"use client";

import { Toaster } from "sonner";
import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth/context/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster position="bottom-right" closeButton richColors toastOptions={{ className: "font-sans" }} />
    </AuthProvider>
  );
}
