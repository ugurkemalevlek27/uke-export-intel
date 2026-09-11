import { PageHeader } from "@/components/ui";
import { ROLE_LABELS_TR, type Role } from "@/lib/roles";
import Link from "next/link";

/** Yetkisiz erisim ekrani — tum korumali sayfalarda ayni dili kullanir. */
export function AccessDenied({
  title,
  role,
  needed,
}: {
  title: string;
  role?: Role;
  needed?: string;
}) {
  return (
    <div className="p-8 max-w-2xl">
      <PageHeader title={title} />
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900">Bu sayfaya erişim yetkiniz yok</h2>
        <p className="text-sm text-slate-600 mt-2">
          {needed
            ? `Bu ekranı görüntülemek için ${needed} yetkisi gerekiyor.`
            : "Bu ekranı görüntülemek için daha geniş bir yetki gerekiyor."}
          {role ? ` Mevcut rolünüz: ${ROLE_LABELS_TR[role]}.` : ""}
        </p>
        <p className="text-sm text-slate-600 mt-2">
          Erişim gerekiyorsa organizasyon yöneticinizden rolünüzü güncellemesini isteyin.
        </p>
        <div className="flex gap-2 mt-5">
          <Link
            href="/"
            className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            Dashboard&apos;a dön
          </Link>
        </div>
      </div>
    </div>
  );
}
