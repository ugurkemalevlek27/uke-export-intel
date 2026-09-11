// Yönetim > Kullanıcılar (Phase 5)
//
// GUVENLIK: Kullanicilar YALNIZCA kendi organizasyonlarini gorur ve yonetir.
// Sifreler hicbir zaman duz metin saklanmaz/gosterilmez; yalnizca bcrypt hash'i tutulur.

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { PageHeader} from "@/components/ui";
import { normalizeRole, ROLES, ROLE_LABELS_TR } from "@/lib/roles";
import { createUserAction, updateUserRoleAction, resetPasswordAction } from "./actions";
import { guardPage } from "@/lib/pageGuard";
import { AccessDenied } from "@/components/AccessDenied";

const inputCls = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export default async function AdminUsersPage() {
  const guard = await guardPage("manageUsers");
  if (!guard.allowed)
    return <AccessDenied title="Kullanıcılar" role={guard.role} needed="kullanıcı yönetimi" />;

  const session = guard.session;
  const organizationId = session.organizationId;
  const myRole = guard.role;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      lastAttempt: sql<Date | null>`(
        SELECT MAX(attempted_at) FROM login_attempts
        WHERE login_attempts.identifier = ${users.email} AND login_attempts.success = true
      )`,
    })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.email));

  // Super yonetici rolu yalnizca bir super yonetici tarafindan atanabilir.
  const assignable = ROLES.filter((r) => r !== "super_admin" || myRole === "super_admin");

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title="Kullanıcılar"
        description="Ekip üyeleri ve yetkileri. Her kullanıcı yalnızca kendi organizasyonunun verisini görür."
      />

      <details className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <summary className="text-sm font-semibold text-slate-900 cursor-pointer hover:text-slate-700">
          + Kullanıcı ekle
        </summary>
        <form action={createUserAction} className="mt-4 grid sm:grid-cols-2 gap-2">
          <input name="name" placeholder="Ad Soyad" className={inputCls} />
          <input name="email" type="email" required placeholder="E-posta *" className={inputCls} />
          <input
            name="password"
            type="password"
            required
            minLength={10}
            placeholder="Başlangıç şifresi * (en az 10 karakter)"
            className={inputCls}
            autoComplete="new-password"
          />
          <select name="role" defaultValue="sales" className={inputCls}>
            {assignable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS_TR[r]}
              </option>
            ))}
          </select>
          <div className="sm:col-span-2">
            <button className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800">
              Kullanıcı Oluştur
            </button>
            <span className="ml-3 text-xs text-slate-400">
              Şifreyi kullanıcıya güvenli bir kanaldan iletin ve ilk girişte değiştirmesini isteyin.
            </span>
          </div>
        </form>
      </details>

      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        {rows.map((u) => (
          <div key={u.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  {u.name || u.email}
                  {u.id === session.userId && (
                    <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
                      siz
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{u.email}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Rol: {ROLE_LABELS_TR[normalizeRole(u.role)]}
                  {u.lastAttempt
                    ? ` · Son giriş: ${new Date(u.lastAttempt).toLocaleDateString("tr-TR")}`
                    : ""}
                </div>
              </div>

              <form
                action={updateUserRoleAction.bind(null, u.id)}
                className="flex gap-2 items-center flex-wrap"
              >
                <select
                  name="role"
                  defaultValue={normalizeRole(u.role)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS_TR[r]}
                    </option>
                  ))}
                </select>
                <button className="bg-slate-100 text-slate-700 rounded-md px-3 py-1 text-xs font-medium hover:bg-slate-200">
                  Rolü Güncelle
                </button>
              </form>
            </div>

            <details className="mt-2">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-900">
                Şifre sıfırla
              </summary>
              <form
                action={resetPasswordAction.bind(null, u.id)}
                className="mt-2 flex gap-2 flex-wrap items-center"
              >
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  placeholder="Yeni şifre (en az 10 karakter)"
                  autoComplete="new-password"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs w-64"
                />
                <button className="bg-slate-100 text-slate-700 rounded-md px-3 py-1 text-xs font-medium hover:bg-slate-200">
                  Sıfırla
                </button>
              </form>
            </details>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Roller: Görüntüleyici (yalnızca analiz) · Satış (CRM düzenler) · Analist (veri yükler) ·
        Yönetici (veri kalitesi, projeler) · Organizasyon Yöneticisi (kullanıcılar).
      </p>
    </div>
  );
}
