# ACC WhatsApp test setup

The selected project is ACC PLASTİK ABD (project 3, organization 19, client key project-3).
The Meta test Phone Number ID is 1399636089890657. It is an identifier, not an access token.

Provision with `npx.cmd tsx --env-file=.env scripts/setup-acc-whatsapp.ts`.
The script validates the exact project/account scope and creates a disabled account only.
Repeated runs reuse the account; scope conflicts roll back without modifying existing accounts.
Provisioned account: 20. Callback path: `/api/integrations/whatsapp/20/webhook`.

Application authorization is now enabled using `scripts/activate-whatsapp-admin.ts` for the user-authorized personal test number and existing Uğur Kemal Evlek super_admin account. The administrator can prefix questions with `ACC` or `DEKORAL`; the server resolves the exact project and checks the actual user role. Without a prefix the transport account's ACC project remains the default. No ordinary user gains cross-project access.

Live WhatsApp activation remains incomplete:
- Set ACC_WA_APP_SECRET, ACC_WA_VERIFY_TOKEN and a fresh ACC_WA_ACCESS_TOKEN in local ignored environment configuration. Never commit or paste secrets into chat.
- The personal test number is linked to the existing primary administrator. Other numbers remain unauthorized.
- Reply worker implemented in `scripts/whatsapp-reply-worker.ts`. Run once with `npx.cmd tsx --env-file=.env --env-file=.env.local scripts/whatsapp-reply-worker.ts`, or append `--watch` for polling. Real delivery requires ACC_WA_LIVE_SEND=true, the exact ACC_WA_TEST_RECIPIENT, a fresh token, current primary-admin permission and a recent incoming message. No live delivery was tested yet.
- Configure a public HTTPS callback and subscribe Meta messages events.
- The account is enabled for application processing; missing Meta secrets still prevent external webhook processing. Verify end-to-end delivery after completing credentials and callback configuration.

Normal users can query only. Only the actual super_admin role may add companies; WhatsApp update/delete operations remain disabled.
Current question handling uses fixed query templates, not a connected AI model.

Migration 0009 adds durable delivery attempt, retry, provider ID and error fields. HTTP 429 retries at most five attempts. Unknown outcomes and stale sending claims go to review without automatic resend. This avoids blind duplicate delivery; exactly-once delivery across an external HTTP API is not guaranteed.

`node scripts/whatsapp-webhook-gateway.mjs` listens on loopback port 5679 and forwards only the account 20 GET/POST callback to the development app on port 3001. Publish this gateway, not the CRM port, through an HTTPS tunnel. A public tunnel is not configured yet.

Provider request format reference: https://www.postman.com/meta/whatsapp-business-platform/request/0arw2jw/send-text-message-with-preview-url
