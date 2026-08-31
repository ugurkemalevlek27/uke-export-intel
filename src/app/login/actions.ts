"use server";

import { verifyLogin, createSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await verifyLogin(email, password);
  if (!user) {
    return { error: "E-posta veya şifre hatalı." };
  }

  await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
  });

  redirect("/");
}
