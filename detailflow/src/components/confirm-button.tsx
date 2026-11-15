"use client";
import { Button } from "./ui";

export function ConfirmSubmit({ children, message, variant = "danger", size = "sm" }: { children: React.ReactNode; message: string; variant?: "danger" | "secondary" | "ghost"; size?: "sm" | "md" }) {
  return (
    <Button type="submit" variant={variant} size={size} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </Button>
  );
}
