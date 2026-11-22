import { SignUpForm } from "@/components/auth-forms";
export const metadata = { title: "Registrieren" };
export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return <SignUpForm refCode={ref && /^[A-Za-z0-9]{8}$/.test(ref) ? ref.toUpperCase() : undefined} />;
}
