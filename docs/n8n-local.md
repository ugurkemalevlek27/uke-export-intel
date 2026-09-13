# n8n yerel entegrasyonu

`.env.example` dosyasını `.env` olarak kopyalayın ve gerçek secret değerlerini yalnızca
yerel `.env` içinde tanımlayın. `docker compose up --build` UKE uygulamasını 3000,
n8n editörünü 5678 portunda açar. n8n, kendi `n8n-postgres` servisini ve kalıcı
volume'lerini kullanır; UKE'nin `DATABASE_URL` veritabanından ayrıdır.

## UKE event webhook'u

n8n, `POST /api/integrations/n8n/events` adresine ham JSON gövdesiyle birlikte şu
header'ları gönderir:

- `X-UKE-Timestamp`: Unix zamanı, saniye cinsinden. Beş dakikadan eski istek reddedilir.
- `X-UKE-Nonce`: Tek kullanımlık, tahmin edilemez değer.
- `X-UKE-Signature`: `sha256=` önekli küçük harf hex HMAC.

İmza girdisi `timestamp + "." + nonce + "." + rawBody` biçimindedir ve
`UKE_WEBHOOK_SECRET` ile HMAC-SHA256 hesaplanır. Geçici `503` yanıtlarında n8n aynı
`external_event_id` ve nonce ile tekrar denemelidir. UKE en fazla üç geçici veritabanı
hatasını kendi içinde de yeniden dener.

Her event şu alanları içermelidir: `organization_id`, `client_id`, `project_id`,
`lead_id`, `contact_id`, `external_event_id`, `occurred_at`, `event_type`.
`client_id`, migration'ın mevcut projeler için oluşturduğu `project-<id>` anahtarıyla
eşleşir. Kapsam ilişkileri uyuşmazsa veya event tipi desteklenmiyorsa event CRM'e
yazılmaz ve `integration_review_queue` tablosuna alınır.
