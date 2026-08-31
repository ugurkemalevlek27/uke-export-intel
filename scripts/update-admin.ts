// Admin kullanicinin giris e-postasini (ve istege bagli olarak sifresini) degistirir.
//
// Kullanim:
//   npx tsx --env-file=.env scripts/update-admin.ts <mevcut-email> <yeni-email>
//   npx tsx --env-file=.env scripts/update-admin.ts <mevcut-email> <yeni-email> <yeni-sifre>
//
// Ornek:
//   npx tsx --env-file=.env scripts/update-admin.ts ugurkemalevlek27@gmail.com info@ukeglobal.com

import bcrypt from "bcryptjs";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [currentEmail, newEmail, newPassword] = process.argv.slice(2);

  if (!currentEmail || !newEmail) {
    console.error(
      "Kullanim: npx tsx --env-file=.env scripts/update-admin.ts <mevcut-email> <yeni-email> [yeni-sifre]"
    );
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, currentEmail));
  if (!user) {
    console.error(`HATA: "${currentEmail}" e-postali bir kullanici bulunamadi.`);
    process.exit(1);
  }

  const updates: { email: string; passwordHash?: string } = { email: newEmail };
  if (newPassword) {
    updates.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await db.update(users).set(updates).where(eq(users.id, user.id));

  console.log(`Guncellendi: ${currentEmail} -> ${newEmail}`);
  if (newPassword) console.log("Sifre de guncellendi.");
  process.exit(0);
}

main().catch((err) => {
  console.error("HATA:", err);
  process.exit(1);
});
