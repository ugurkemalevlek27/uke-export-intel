// Firma sayfasi: Kisiler paneli (Phase 4)
//
// Server Component - form'lar dogrudan Server Action'a gider, ekstra client JS yok.
// Ekleme/duzenleme formlari <details> icinde acilir (JS gerektirmeyen accordion).

import type { ContactRow } from "@/lib/crm";
import { createContactAction, updateContactAction } from "@/app/(app)/companies/[id]/actions";

const inputCls = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

function ContactFields({ c }: { c?: ContactRow }) {
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      <input name="name" defaultValue={c?.name ?? ""} placeholder="Ad Soyad *" required className={inputCls} />
      <input name="position" defaultValue={c?.position ?? ""} placeholder="Görev / Ünvan" className={inputCls} />
      <input name="email" type="email" defaultValue={c?.email ?? ""} placeholder="E-posta" className={inputCls} />
      <input name="phone" defaultValue={c?.phone ?? ""} placeholder="Telefon" className={inputCls} />
      <input name="whatsapp" defaultValue={c?.whatsapp ?? ""} placeholder="WhatsApp" className={inputCls} />
      <input name="linkedin" defaultValue={c?.linkedin ?? ""} placeholder="LinkedIn profili" className={inputCls} />
      <textarea
        name="notes"
        defaultValue={c?.notes ?? ""}
        rows={2}
        placeholder="Not"
        className={`${inputCls} sm:col-span-2`}
      />
      <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-2">
        <input type="checkbox" name="isPrimary" defaultChecked={c?.isPrimary ?? false} className="rounded" />
        Birincil kişi (karar verici)
      </label>
    </div>
  );
}

export function ContactsPanel({
  companyId,
  contacts,
  canEdit,
}: {
  companyId: number;
  contacts: ContactRow[];
  canEdit: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Kişiler</h2>
        <span className="text-xs text-slate-400">{contacts.length} kayıt</span>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-400 mt-3">Henüz kişi eklenmemiş.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {contacts.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                    {c.name || "İsimsiz"}
                    {c.isPrimary && (
                      <span className="text-[10px] font-medium bg-slate-900 text-white rounded px-1.5 py-0.5">
                        Birincil
                      </span>
                    )}
                  </div>
                  {c.position && <div className="text-xs text-slate-500">{c.position}</div>}
                  <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="hover:underline">
                        {c.email}
                      </a>
                    )}
                    {c.phone && <span>{c.phone}</span>}
                    {c.whatsapp && (
                      <a
                        href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        WhatsApp
                      </a>
                    )}
                    {c.linkedin && (
                      <a
                        href={c.linkedin.startsWith("http") ? c.linkedin : `https://${c.linkedin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                  {c.notes && <p className="text-xs text-slate-400 mt-1">{c.notes}</p>}
                </div>
              </div>

              {canEdit && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-900">
                    Düzenle
                  </summary>
                  <form action={updateContactAction.bind(null, c.id)} className="mt-2 space-y-2">
                    <ContactFields c={c} />
                    <button className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-slate-800">
                      Güncelle
                    </button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <details className="mt-4 border-t border-slate-100 pt-3">
          <summary className="text-sm font-medium text-slate-700 cursor-pointer hover:text-slate-900">
            + Kişi ekle
          </summary>
          <form action={createContactAction.bind(null, companyId)} className="mt-3 space-y-2">
            <ContactFields />
            <button className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-slate-800">
              Kaydet
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
