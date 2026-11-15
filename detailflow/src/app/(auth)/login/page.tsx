import { LoginForm } from "@/components/auth-forms";
export const metadata = { title: "Anmelden" };
export default async function Page({ searchParams }: { searchParams: Promise<{ weiter?: string }> }) {
  const { weiter } = await searchParams;
  return <LoginForm next={weiter} />;
}
