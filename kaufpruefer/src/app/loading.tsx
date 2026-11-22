export default function Loading() {
  return (
    <div className="mx-auto flex max-w-6xl justify-center px-4 py-32" aria-busy>
      <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}
