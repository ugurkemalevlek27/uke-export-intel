# UKE Global — Export Intelligence & B2B Sales Platform (V1)

Ticaret verisini analiz ederek ülke, ithalatçı, firma ve lead yönetimini tek platformda
gerçekleştirmeyi amaçlayan V1 sürümü.

## Teknik Yapı

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **PostgreSQL** — veritabanı
- **Drizzle ORM** — veritabanı erişim katmanı (bkz. `src/db/schema.ts`)
- Basit oturum (login) sistemi — `jose` (JWT) + `bcryptjs`

## Kurulum (yerel geliştirme)

```bash
npm install
cp .env.example .env   # DATABASE_URL ve SESSION_SECRET değerlerini doldurun
npx drizzle-kit push   # şemayı veritabanına uygular
npx tsx --env-file=.env scripts/seed.ts   # örnek veri yükler (opsiyonel)
npm run dev
```

Giriş bilgileri (seed script ile oluşturulan, ilk girişte değiştirilmeli):
- E-posta: `ugurkemalevlek27@gmail.com`
- Şifre: `UkeGlobal2026!`

## Klasör Yapısı

```
src/
  app/
    login/            - giriş sayfası
    (app)/             - oturum gerektiren tüm sayfalar
      page.tsx          - Dashboard
      companies/        - Firma listesi + detay sayfası
      import/           - Veri içe aktarma sayfası
  components/ui.tsx     - Paylaşılan küçük bileşenler (KPI kartı, skor rozeti, vb.)
  db/
    schema.ts           - Veritabanı şeması (tablolar)
    index.ts            - Veritabanı bağlantısı
  lib/
    scoring.ts           - Fırsat/Lead Skoru — MERKEZİ hesaplama mantığı
    normalize.ts          - Firma adı normalizasyonu
    duplicates.ts          - Olası duplicate firma tespiti
    importTradeDataRows.ts  - Excel/CSV içe aktarma pipeline'ı
    queries.ts              - Dashboard/Firma sayfaları için veri sorguları
    auth.ts                 - Oturum yönetimi
scripts/
  seed.ts               - 3 örnek Excel dosyasını (Azerbaycan/HS 3208) içe aktarır
```

## V1 Kapsamı

- [x] Excel/CSV veri içe aktarma (esnek sütun eşleştirme, hata/duplicate tespiti)
- [x] Dashboard (temel KPI'lar, ülkelere göre dağılım, en yüksek potansiyelli firmalar)
- [x] Firma listesi (arama, skor filtresi)
- [x] Firma detay sayfası (ticaret geçmişi, tedarikçiler, ürünler, açıklanabilir Fırsat Skoru)
- [x] Temel CRM alanları (lead durumu, satış temsilcisi, takip tarihi, notlar)
- [x] Basit giriş sistemi (tek organizasyon, V1 için yeterli)

## V1'de Bilinçli Olarak Ertelenenler (sonraki versiyonlar)

- Çoklu kullanıcı / rol yönetimi (şu an tek admin kullanıcı)
- Dünya haritası görselleştirmesi
- CRM aktivite geçmişi (e-mail/telefon/LinkedIn kayıtları) — veritabanı şemasında yer var
  (`activities` tablosu) ama arayüzü henüz yok
- Excel/PDF export
- AI destekli analiz ve e-mail taslağı oluşturma

## Güvenlik Notu

Bu sistem gerçek ticari veriler içerir. **Herkese açık bir adrese (internet) yayınlamadan
önce**: `.env` dosyasındaki `SESSION_SECRET` değerini production'a özel, rastgele bir
değerle değiştirin ve production veritabanı bağlantısını kullanın.
