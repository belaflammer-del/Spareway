import type { Metadata } from "next";
import { CheckFlow } from "@/components/check/check-flow";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { categoryStatus, providerEnabled } from "@/lib/config/providers";
import { CATEGORY_LABELS } from "@/lib/domain/labels";
import { getStore } from "@/lib/store";
import { getPricing } from "@/lib/wallet/service";

export const metadata: Metadata = { title: "Angebot prüfen" };

export default async function CheckPage({ searchParams }: PageProps<"/check">) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const [balance, pricing, aiOn] = await Promise.all([user ? getStore().getBalance(user.id) : 0, getPricing(), providerEnabled("ai")]);
  const cats = Object.keys(CATEGORY_LABELS);
  const statuses = Object.fromEntries(await Promise.all(cats.map(async (c) => [c, await categoryStatus(c)] as const)));
  const url = typeof sp.url === "string" ? sp.url.slice(0, 2000) : undefined;
  const mode = sp.mode === "screenshots" ? "screenshots" : sp.mode === "text" ? "text" : "link";
  return (
    <CheckFlow
      initialUrl={url}
      initialMode={mode}
      loggedIn={!!user}
      balance={balance}
      aiAvailable={aiOn}
      fullCheckCost={pricing.fullCheckCost}
      videoMaxSeconds={env.videoMaxSeconds}
      videoMaxMb={env.videoMaxMb}
      categoryStatus={statuses}
    />
  );
}
