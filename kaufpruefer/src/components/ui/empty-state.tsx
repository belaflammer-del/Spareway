"use client";

import dynamic from "next/dynamic";
import type { ModelName } from "@/components/home/three-models";
import { cn } from "@/lib/utils";

const ModelViewer = dynamic(() => import("@/components/report/model-viewer").then((m) => m.ModelViewer), { ssr: false });

/** Leerer Zustand mit langsam drehendem 3D-Objekt statt leerer Fläche. */
export function EmptyState({ model, title, text, children, className }: { model: ModelName; title: string; text?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-dashed border-border px-6 pb-6 text-center", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-6 mx-auto size-28 rounded-full bg-accent/10 blur-2xl" />
      <ModelViewer model={model} label={false} className="mx-auto h-32 w-full max-w-56" />
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      {children}
    </div>
  );
}
