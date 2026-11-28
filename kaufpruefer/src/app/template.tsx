/** Wird bei jedem Seitenwechsel neu eingehängt → sanftes Einblenden des Inhalts (Kopf & Navigation bleiben stehen). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
