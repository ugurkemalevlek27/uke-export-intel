# İletişim entegrasyonları

`/crm/messages` ekranından organizasyon yöneticisi her müşteri/proje için ayrı hesap
ekler. Dekoral ve ACC için ayrı adres, hesap ve credential öneki zorunludur; adres
ve önek veritabanında benzersizdir. Hesap kapsamı sunucuda projenin `client_key`
değeriyle doğrulanır. Gerçek şifre/token bu ekrana veya Git'e yazılmaz.

## Yerel test

Mesaj hazırlama formu alıcıyı lead ve kişi kaydıyla doğrular. Yetkisiz WhatsApp
numaraları, belirsiz eşleşmeler, iletişim engelleri ve limit aşımı incelemeye düşer.
Credentials yoksa `configuration_required`, varsa `dry_run` kaydedilir. Her iki
durumda da gerçek gönderim YAPILMAZ. CRM aktivitesi bu durumu açıkça taşır.

`npm run test:communications` geçici kayıtları tek transaction içinde test eder;
sonunda ROLLBACK yapar, DELETE çalıştırmaz.

## E-posta / n8n adaptörü

Gmail OAuth, SMTP/IMAP ve Microsoft Graph bağlantıları n8n tarafında yönetilir.
UKE sağlayıcıdan bağımsız normalize edilmiş olayları alır. Her hesabın ayrı
`<PREFIX>_WEBHOOK_SECRET` değeri vardır. n8n sağlayıcı akışı credentials olmadan
çalıştırılamaz; bu depoda gerçek hesap bağlantısı kurulmamıştır.

`POST /api/integrations/mail/<accountId>/events`

Header'lar `X-UKE-Timestamp`, `X-UKE-Nonce` (16–255 ASCII harf/rakam/_/-) ve
`X-UKE-Signature` kullanır. İmza mevcut n8n sözleşmesiyle aynıdır:
`sha256=HMAC_SHA256(secret, timestamp + '.' + nonce + '.' + rawJSON)`.

Normalize olay:

```json
{
  "external_event_id": "provider-event-unique-id",
  "occurred_at": "2026-09-13T12:00:00Z",
  "direction": "incoming",
  "address": "contact@example.com",
  "provider_message_id": "provider-message-id",
  "thread_id": "provider-thread-id",
  "subject": "Re: Katalog",
  "body": "Mesaj içeriği"
}
```

Gelen olayda eşleşme hesap/proje/kişi kapsamında yapılır. Konu üzerinden tahmini
eşleştirme yapılmaz. Belirsiz thread veya alıcı eşleşmesi incelemeye düşer.
Gerçekte gönderilmiş e-postayı kaydetmek için `direction: outgoing`, `status: sent`,
`provider_message_id`, `lead_id` ve `contact_id` gerekir. Bu bir gönderme komutu değildir.
Durum olayları `direction: status`, `provider_message_id` ve `status` alanlarını
taşır. `bounce` / `unsubscribe` doğrulanmış mesajın alıcısını müşteri kapsamında
engeller. Manuel do-not-contact engeli ekrandan kaydedilir.

## WhatsApp / Meta

Hesap adresi Meta `phone_number_id` değeridir. `credential_prefix` örneğin
`DEKORAL_WA` ise yerel ortamda `DEKORAL_WA_APP_SECRET` ve `DEKORAL_WA_VERIFY_TOKEN`
tanımlanır. Callback: `/api/integrations/whatsapp/<accountId>/webhook`.
GET doğrulama challenge'ını, POST ham gövdenin `X-Hub-Signature-256` imzasını
kontrol eder. Gövdedeki telefon hesabı kayıtlı hesaba uymalıdır.

Yetkili numaralar yönetici tarafından eklenir. Gelen mesaj ve teslim/okunma
durumları kayıt altındadır. Okundu durumu geç gelen teslim/gönderildi olayıyla
geriye alınmaz. Aynı olay ikinci mesaj/CRM aktivitesi oluşturmaz.

`/ai` ile başlayan sorgular ayrıca AI yetkisi kontrolünden geçer. AI sağlayıcısı
henüz bağlı değildir; yetkili sorgu `ai_configuration_required` inceleme durumuna
alınır. Harici modele CRM verisi gönderilmez ve AI cevabı üretilmiş gibi gösterilmez.

## Çalıştırma sınırları

- Docker ve WSL henüz kurulu değil; WSL kurulum denemesi başarısız oldu.
- Mevcut 3000 uygulamasını koruyarak yalnızca n8n için `docker compose up -d n8n`
  kullanın; UKE adresi `http://host.docker.internal:3000` olur.
- Tam stack için mevcut 3000 port çakışmasını çözün veya `UKE_PORT=3001` ayarlayın;
  n8n içindeki UKE adresi `http://uke:3000` olmalıdır.
- Compose portları yalnızca loopback'e bağlanır. HTTP için secure-cookie kapalıdır;
  dış HTTPS yayınına geçerken bunu değiştirin.
- İnceleme ekranı kayıtları listeler; eşleşme düzeltme/onaylama akışı henüz yoktur.

Referanslar: [Meta webhook doğrulaması](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/),
[n8n Docker kurulumu](https://github.com/n8n-io/n8n-docs/blob/main/docs/deploy/host-n8n/install-options/install-with-docker.md).
