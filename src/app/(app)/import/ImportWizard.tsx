"use client";

import Link from "next/link";

import { useState, useRef } from "react";
import { previewFileAction, importFileAction, type PreviewState, type ImportActionState } from "./actions";
import { IMPORT_FIELDS, FIELD_LABELS, REQUIRED_FIELDS, type ImportField } from "@/lib/columnMapping";

type Step = 1 | 2 | 3 | 4;

/**
 * Import Wizard (Phase 4)
 *
 * V1'de dosya dogrudan yukleniyor ve sutunlar sabit bir listeye gore
 * esleniyordu; baslik taninmazsa veri sessizce kayboluyordu. Artik kullanici
 * eslestirmeyi GORUYOR ve duzeltebiliyor.
 *
 * Dosya, onizleme ve ice aktarma adimlarinda iki kez gonderilir; boylece
 * sunucuda gecici dosya saklanmasi gerekmez.
 */
export default function ImportWizard({ projects }: { projects: { id: number; name: string; clientName: string | null }[] }) {
  const [step, setStep] = useState<Step>(1);
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ? String(projects[0].id) : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState["preview"] | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({});
  const [result, setResult] = useState<ImportActionState["success"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const missing = REQUIRED_FIELDS.filter((f) => !mapping[f]);

  async function handlePreview() {
    if (!file || !projectId) {
      setError("Proje ve dosya seçin.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("file", file);
    const res = await previewFileAction(undefined, fd);
    setBusy(false);
    if (res.error || !res.preview) {
      setError(res.error ?? "Önizleme oluşturulamadı.");
      return;
    }
    setPreview(res.preview);
    setMapping(res.preview.suggested);
    setStep(2);
  }

  async function handleImport() {
    if (!file || !projectId) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("file", file);
    fd.set("mapping", JSON.stringify(mapping));
    const res = await importFileAction(undefined, fd);
    setBusy(false);
    if (res.error || !res.success) {
      setError(res.error ?? "İçe aktarma başarısız.");
      return;
    }
    setResult(res.success);
    setStep(4);
  }

  function reset() {
    setStep(1);
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  // Dogrulama ozeti (adim 3) - dosyanin ornek satirlarindan hesaplanir
  const validation = preview ? validateSample(preview.sampleRows, mapping) : null;

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <Stepper step={step} />

      <div className="p-5">
        {error && (
          <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md p-3">
            {error}
          </div>
        )}

        {/* ---------------- ADIM 1: Dosya ---------------- */}
        {step === 1 && (
          <div className="space-y-4">
            <Field label="Proje">
              <select
                id="wizard-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={projects.length === 0}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {projects.length === 0 && <option value="">Önce proje oluşturun</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clientName ? `${p.clientName} — ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Dosya (.xlsx veya .csv)">
              <input
                id="wizard-file"
                ref={fileInput}
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
            </Field>

            {file && (
              <p className="text-xs text-slate-500">
                Seçilen: {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}

            <button
              onClick={handlePreview}
              disabled={busy || !file || !projectId}
              className="bg-slate-900 text-white rounded-md px-5 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Dosya okunuyor..." : "Devam → Önizleme"}
            </button>
          </div>
        )}

        {/* ---------------- ADIM 2: Onizleme + eslestirme ---------------- */}
        {step === 2 && preview && (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-slate-700">
                <strong>{preview.fileName}</strong> · {preview.totalRows.toLocaleString("tr-TR")} satır ·{" "}
                {preview.headers.length} sütun
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                İlk 20 satır gösteriliyor. Sütun eşleştirmesini aşağıdan kontrol edin.
              </p>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md max-h-64">
              <table className="text-xs whitespace-nowrap">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="text-left font-medium text-slate-500 px-3 py-2 border-b border-slate-200">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-slate-600 max-w-[220px] truncate" title={r[h]}>
                          {r[h] || <span className="text-slate-300">boş</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Sütun Eşleştirme</h3>
              <p className="text-xs text-slate-400 mb-3">
                Sistem otomatik eşleştirdi; yanlış olanları değiştirebilirsiniz.
                <span className="text-red-600"> *</span> işaretli alanlar zorunludur.
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                {IMPORT_FIELDS.map((f) => {
                  const isRequired = REQUIRED_FIELDS.includes(f);
                  const unset = isRequired && !mapping[f];
                  return (
                    <label key={f} className="block">
                      <span className="block text-xs font-medium text-slate-600 mb-1">
                        {FIELD_LABELS[f]}
                        {isRequired && <span className="text-red-600"> *</span>}
                      </span>
                      <select
                        id={`map-${f}`}
                        value={mapping[f] ?? ""}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))
                        }
                        className={`w-full rounded-md border px-2 py-1.5 text-sm ${
                          unset ? "border-red-300 bg-red-50" : "border-slate-300"
                        }`}
                      >
                        <option value="">— eşleştirilmedi —</option>
                        {preview.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(3)}
                disabled={missing.length > 0}
                className="bg-slate-900 text-white rounded-md px-5 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                Devam → Doğrulama
              </button>
              <button onClick={reset} className="border border-slate-300 rounded-md px-4 py-2 text-sm hover:bg-slate-50">
                Baştan
              </button>
            </div>
            {missing.length > 0 && (
              <p className="text-xs text-red-600">
                Zorunlu alanlar eşleştirilmeden devam edilemez: {missing.map((f) => FIELD_LABELS[f]).join(", ")}
              </p>
            )}
          </div>
        )}

        {/* ---------------- ADIM 3: Dogrulama ---------------- */}
        {step === 3 && preview && validation && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Doğrulama Özeti</h3>
              <p className="text-xs text-slate-400">
                İlk {preview.sampleRows.length} satır üzerinden yapılan kontrol. Toplam{" "}
                {preview.totalRows.toLocaleString("tr-TR")} satır işlenecek.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Toplam Satır" value={preview.totalRows.toLocaleString("tr-TR")} />
              <Stat label="Örnekte Geçerli" value={`${validation.valid} / ${preview.sampleRows.length}`} />
              <Stat
                label="Örnekte Sorunlu"
                value={String(validation.invalid)}
                tone={validation.invalid > 0 ? "warn" : undefined}
              />
              <Stat label="Eşleşen Sütun" value={`${Object.values(mapping).filter(Boolean).length} / ${IMPORT_FIELDS.length}`} />
            </div>

            {validation.issues.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-md p-3">
                <p className="text-xs font-medium text-amber-800 mb-1.5">Örnek satırlarda görülen sorunlar</p>
                <ul className="text-xs text-amber-700 space-y-0.5">
                  {validation.issues.slice(0, 8).map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1">
              <p className="font-medium text-slate-600">İçe aktarma sırasında:</p>
              <p>• Zorunlu alanı eksik satırlar atlanır ve raporlanır — uydurma veri eklenmez.</p>
              <p>• Daha önce yüklenmiş <strong>aynı sevkiyat kayıtları tekrar eklenmez</strong>, atlananlar raporlanır.</p>
              <p>• Benzer isimli firmalar &quot;olası duplicate&quot; olarak işaretlenir; otomatik birleştirme yapılmaz.</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={busy}
                className="bg-slate-900 text-white rounded-md px-5 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? "İçe aktarılıyor..." : "İçe Aktar"}
              </button>
              <button onClick={() => setStep(2)} className="border border-slate-300 rounded-md px-4 py-2 text-sm hover:bg-slate-50">
                ← Eşleştirmeye dön
              </button>
            </div>
          </div>
        )}

        {/* ---------------- ADIM 4: Rapor ---------------- */}
        {step === 4 && result && (
          <div className="space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4">
              <p className="text-sm font-medium text-emerald-900">{result.fileName} işlendi.</p>
              <p className="text-sm text-emerald-800 mt-1">
                {result.successCount.toLocaleString("tr-TR")} yeni satır eklendi.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Toplam Satır" value={result.rowCount.toLocaleString("tr-TR")} />
              <Stat label="Eklenen" value={result.successCount.toLocaleString("tr-TR")} />
              <Stat
                label="Duplicate (atlandı)"
                value={result.skippedDuplicateCount.toLocaleString("tr-TR")}
                tone={result.skippedDuplicateCount > 0 ? "warn" : undefined}
              />
              <Stat
                label="Hatalı Satır"
                value={result.errorCount.toLocaleString("tr-TR")}
                tone={result.errorCount > 0 ? "warn" : undefined}
              />
            </div>

            {result.skippedDuplicateCount > 0 && (
              <p className="text-xs text-slate-500">
                {result.skippedDuplicateCount.toLocaleString("tr-TR")} satır daha önce yüklenmiş
                kayıtlarla birebir aynı olduğu için atlandı — rakamlarınız çift saymadı.
              </p>
            )}

            {result.duplicateCandidateCount > 0 && (
              <p className="text-xs text-slate-500">
                {result.duplicateCandidateCount} olası duplicate firma işaretlendi. Veri Kalitesi
                ekranından inceleyebilirsiniz.
              </p>
            )}

            {result.errors.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-md p-3">
                <p className="text-xs font-medium text-amber-800 mb-1.5">
                  Atlanan satırlar (ilk {result.errors.length})
                </p>
                <ul className="text-xs text-amber-700 space-y-0.5 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <li key={i}>• Satır {e.rowNumber}: {e.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={reset} className="bg-slate-900 text-white rounded-md px-5 py-2 text-sm font-medium hover:bg-slate-800">
                Yeni Dosya Yükle
              </button>
              <Link href="/" className="border border-slate-300 rounded-md px-4 py-2 text-sm hover:bg-slate-50">
                Dashboard&apos;a git
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function validateSample(
  rows: Record<string, string>[],
  mapping: Partial<Record<ImportField, string>>
): { valid: number; invalid: number; issues: string[] } {
  let valid = 0;
  let invalid = 0;
  const issues = new Set<string>();

  for (const r of rows) {
    const hs = mapping.hsCode ? r[mapping.hsCode] : "";
    const imp = mapping.importer ? r[mapping.importer] : "";
    const val = mapping.valueUsd ? r[mapping.valueUsd] : "";
    const num = Number(String(val).replace(/\s/g, "").replace(/,/g, ""));

    const problems: string[] = [];
    if (!hs?.trim()) problems.push("GTİP boş");
    if (!imp?.trim()) problems.push("İthalatçı boş");
    if (!val?.trim()) problems.push("Değer (USD) boş");
    else if (!Number.isFinite(num)) problems.push(`Değer sayıya çevrilemiyor ("${val}")`);

    if (mapping.date) {
      const d = r[mapping.date];
      if (d && isNaN(new Date(d).getTime()) && !/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(d)) {
        problems.push(`Tarih okunamıyor ("${d}")`);
      }
    }

    if (problems.length === 0) valid++;
    else {
      invalid++;
      problems.forEach((p) => issues.add(p));
    }
  }
  return { valid, invalid, issues: Array.from(issues) };
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Dosya", "Eşleştirme", "Doğrulama", "Sonuç"];
  return (
    <div className="flex border-b border-slate-200">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <div
            key={l}
            className={`flex-1 min-w-0 px-2 sm:px-4 py-3 text-xs font-medium flex items-center gap-1.5 sm:gap-2 ${
              active ? "text-slate-900" : done ? "text-slate-500" : "text-slate-300"
            }`}
          >
            <span
              className={`w-5 h-5 shrink-0 rounded-full grid place-items-center text-[10px] ${
                active ? "bg-slate-900 text-white" : done ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className="truncate">{l}</span>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={`rounded-md border p-3 ${tone === "warn" ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
      <div className="text-[10px] font-medium text-slate-400 tracking-wide uppercase">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "warn" ? "text-amber-800" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
