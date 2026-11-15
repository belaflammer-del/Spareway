"use client";
import { Printer } from "lucide-react";
import { Button } from "./ui";
export function PrintButton() {
  return <Button variant="secondary" type="button" onClick={() => window.print()}><Printer className="size-4" />PDF / Drucken</Button>;
}
export function CopyButton({ text, label = "Link kopieren" }: { text: string; label?: string }) {
  return <Button variant="secondary" type="button" size="sm" onClick={() => navigator.clipboard?.writeText(text)}>{label}</Button>;
}
