"use server";

import { verifyLogin, createSession } from "@/lib/auth";
import { checkRateLimit, recordAttempt, MAX_FAILED_ATTEMPTS } from "@/lib/rateLimit";
import { redirect } from "next/navigation";

export async function loginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // 1) Brute-force koruma: kilitliyse sifre hic kontrol edilmez.
  const limit = await checkRateLimit(email);
  if (limit.blocked) {
    return {
      error: `Çok fazla başarısız giriş denemesi. Lütfen ${limit.retryAfterMinutes} dakika sonra tekrar deneyin.`,
    };
  }

  const user = await verifyLogin(email, password);

  if (!user) {
    await recordAttempt(email, false);
    const remaining = MAX_FAILED_ATTEMPTS - (limit.failedCount + 1);
    return {
      error:
        remaining > 0 && remaining <= 2
          ? `E-posta veya şifre hatalı. ${remaining} deneme hakkınız kaldı.`
          : "E-posta veya şifre hatalı.",
    };
  }

  await recordAttempt(email, true);

  await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
  });

  redirect("/");
}
