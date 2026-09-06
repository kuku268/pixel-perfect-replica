"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";

// Mirrors what src/main.tsx wired up under Vite: one QueryClient for the whole
// app, the sonner Toaster, and the ErrorBoundary that used to wrap <Routes>.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>{children}</ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  );
}
