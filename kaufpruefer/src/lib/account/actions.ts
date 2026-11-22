"use server";

import { redirect } from "next/navigation";
import { features } from "../config/env";
import { supabaseServer } from "../auth/supabase-server";
import { destroyLocalSession, getCurrentUser } from "../auth/session";
import { getStore } from "../store";
import { deleteUpload } from "../uploads/service";
import type { FormState } from "../auth/actions";

/** DSGVO Art. 17: Löschung des Kontos und aller personenbezogenen Daten. */
export async function deleteAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Nicht angemeldet" };
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "LÖSCHEN") return { error: "Bitte gib zur Bestätigung LÖSCHEN ein." };
  const store = getStore();
  for (const u of await store.listUploadsByOwner(user.id)) await deleteUpload(u);
  await store.deleteUserData(user.id);
  if (features.supabase) await (await supabaseServer()).auth.signOut();
  else await destroyLocalSession();
  redirect("/?account=deleted");
}

export async function deleteAnalysisAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const id = String(fd.get("id") ?? "");
  await getStore().deleteAnalysis(id, user.id);
  redirect("/dashboard/analyses");
}

export async function deleteMyUploadsAction() {
  const user = await getCurrentUser();
  if (!user) return;
  for (const u of await getStore().listUploadsByOwner(user.id)) await deleteUpload(u);
  redirect("/dashboard/settings?uploads=deleted");
}

