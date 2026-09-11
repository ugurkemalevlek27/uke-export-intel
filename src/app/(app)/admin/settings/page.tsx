// Yönetim > Ayarlar (Phase 5)
//
// Organizasyon bilgisi, kendi şifreni değiştirme ve sistem durumu.
// Sayilar gercek veritabanindan okunur; hicbir deger tahmin edilmez.

import { db } from "@/db";
import {
  organizations,
  users,
  projects,
  companies,
  tradeRecords,
  contacts,
  activities,
  importBatches,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { ROLE_LABELS_TR } from "@/lib/roles";
import { sessionWithRole } from "@/lib/pageGuard";
import { can } from "@/lib/roles";
import { redirect } from "next/navigation";
import { MAX_FAILED_ATTEMPTS, WINDOW_MINUTES } from "@/lib/rateLimit";
import { updateOrganizationAction } from "./actions";
import { PasswordForm } from "./PasswordForm";

export default async function AdminSettingsPage() {
  // Bu sayfa HERKESE aciktir: her kullanicinin kendi sifresini degistirebilmesi
  // gerekir. Organizasyon ayarlari ve sistem durumu bolumleri ise yalnizca
  // yoneticilere gosterilir (asagida canManage kontrolu).
  const ctx = await sessionWithRole();
  if (!ctx) redirect("/login");
  const { session, role: myRole } = ctx;
  const organizationId = session.organizationId;
  const canManage = can.manageUsers(myRole);

  const [me] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, createdAt: organizations.createdAt })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  // Tek turda sayimlar - organizationId ile scope edilir.
  // Yalnizca yoneticiler icin sorgulanir.
  const [counts] = canManage ? await db
    .select({
      users: sql<string>`(SELECT COUNT(*) FROM ${users} WHERE ${users.organizationId} = ${organizationId})`,
      projects: sql<string>`(SELECT COUNT(*) FROM ${projects} WHERE ${projects.organizationId} = ${organizationId})`,
      companies: sql<string>`(SELECT COUNT(*) FROM ${companies} WHERE ${companies.organizationId} = ${organizationId} AND ${companies.mergedIntoId} IS NULL)`,
      merged: sql<string>`(SELECT COUNT(*) FROM ${companies} WHERE ${companies.organizationId} = ${organizationId} AND ${companies.mergedIntoId} IS NOT NULL)`,
      records: sql<string>`(SELECT COUNT(*) FROM ${tradeRecords} WHERE ${tradeRecords.organizationId} = ${organizationId})`,
      contacts: sql<string>`(SELECT COUNT(*) FROM ${contacts} c JOIN ${companies} co ON co.id = c.company_id WHERE co.organization_id = ${organizationId})`,
      activities: sql<string>`(SELECT COUNT(*) FROM ${activities} a JOIN company_projects cp ON cp.id = a.company_project_id JOIN ${companies} co ON co.id = cp.company_id WHERE co.organization_id = ${organizationId})`,
      imports: sql<string>`(SELECT COUNT(*) FROM ${importBatches} WHERE ${importBatches.organizationId} = ${organizationId})`,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
  : [null];

  const n = (v: string | null | undefined) => Number(v ?? 0).toLocaleString("tr-TR");

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader title="Ayarlar" description="Organizasyon bilgisi, hesap güvenliği ve sistem durumu." />

      {canManage && (
      <section className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Organizasyon</h2>
        <p className="text-xs text-slate-400 mb-3">
          Bu ad raporlarda ve PDF başlıklarında görünür.
        </p>
        {canManage ? (
          <form action={updateOrganizationAction} className="flex gap-2 flex-wrap max-w-xl">
            <input
              name="name"
              defaultValue={org?.name ?? ""}
              required
              className="flex-1 min-w-[220px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-slate-800">
              Kaydet
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-700">{org?.name}</p>
        )}
      </section>
      )}

      <section className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Hesabınız</h2>
        <p className="text-xs text-slate-400 mb-3">
          {me?.name ? `${me.name} · ` : ""}
          {me?.email} · {ROLE_LABELS_TR[myRole]}
        </p>
        <PasswordForm />
      </section>

      {canManage && (
      <section className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Sistem Durumu</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Kullanıcı" value={n(counts?.users)} />
          <Stat label="Proje" value={n(counts?.projects)} />
          <Stat label="Firma" value={n(counts?.companies)} />
          <Stat label="Ticaret Kaydı" value={n(counts?.records)} />
          <Stat label="Kişi (CRM)" value={n(counts?.contacts)} />
          <Stat label="Aktivite" value={n(counts?.activities)} />
          <Stat label="Veri Yükleme" value={n(counts?.imports)} />
          <Stat label="Birleştirilmiş Firma" value={n(counts?.merged)} />
        </div>
      </section>
      )}

      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Güvenlik</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>
            <strong className="text-slate-900">Giriş koruması:</strong> Aynı e-posta için{" "}
            {WINDOW_MINUTES} dakika içinde {MAX_FAILED_ATTEMPTS} başarısız denemeden sonra giriş
            geçici olarak kilitlenir.
          </li>
          <li>
            <strong className="text-slate-900">Veri izolasyonu:</strong> Her sorgu organizasyon
            kimliğiyle sınırlanır; başka bir organizasyonun verisi hiçbir şekilde görüntülenemez.
          </li>
          <li>
            <strong className="text-slate-900">Şifreler:</strong> Yalnızca bcrypt özeti saklanır;
            düz metin şifre hiçbir yerde tutulmaz ve gösterilmez.
          </li>
          <li>
            <strong className="text-slate-900">Oturum:</strong> HttpOnly çerez, 30 gün geçerli.
            Şüpheli durumda şifrenizi değiştirin.
          </li>
          <li>
            <strong className="text-slate-900">Veri silme:</strong> Sistem ticaret verisini silmez.
            Yinelenen firmalar birleştirilir (geri alınabilir), projeler arşivlenir.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}
