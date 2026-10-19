"use client";

import { Toaster } from "sonner";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <>{children}<Toaster position="bottom-right" closeButton richColors toastOptions={{ className: "font-sans" }} /></>;
}
