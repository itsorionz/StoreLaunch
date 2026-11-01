# Bangladesh OTP SMS setup

## Provider choice for 5,000–50,000 messages per month

Published prices checked on 20 October 2026. These are advertised non-masking rates, not a negotiated OTP service quotation or a delivery guarantee.

| Provider                                         | Published rate                                                     | Implication                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [SMSQ / Q Technologies](https://smsq.com.bd/)    | BDT 0.30 per SMS, advertised for any quantity                      | Lower advertised starting rate among these options; request a transactional OTP-route quote              |
| [BulkSMSBD](https://bulksmsbd.com/)              | BDT 0.35 at 1,000; 0.32 at 20,000; 0.30 at 50,000; 0.28 at 100,000 | Matches SMSQ's headline rate at 50,000; larger prepaid purchases may be cheaper if credits remain usable |
| [Alpha Net Basic](https://www.alpha.net.bd/SMS/) | BDT 0.40 per SMS; BDT 1,500 minimum recharge, six-month validity   | Higher advertised entry price; higher recharge tiers have lower rates                                    |

At BDT 0.30, 5,000–50,000 single-part messages cost approximately BDT 1,500–15,000 before other charges. Confirm taxes, MNP charges, sender approval/fees, credit expiry, throughput, OTP-route availability and actual delivery latency with the provider. An advertised bulk rate does not establish the effective cost of a delivered OTP. Bangla/Unicode and long messages can use multiple billable segments. The default OTP template is short ASCII text.

The application supports SMSQ and BulkSMSBD, so credentials can be switched without changing login code. Start with a small approved OTP-route purchase and measure delivery on the operators your customers use before buying a large balance.

## Configure SMSQ

Put credentials in the deployment secret manager or local `.env`, never in client code or chat:

```dotenv
SMS_PROVIDER=smsq
SMS_API_KEY=your-private-key
SMS_CLIENT_ID=your-client-id
SMS_SENDER_ID=your-approved-sender
```

The adapter uses the documented HTTPS POST endpoint and checks `ErrorCode=0` plus a message reference before reporting acceptance. See the [SMSQ API documentation](https://services.smsq.com.bd/docs/sms/).

## Configure BulkSMSBD

```dotenv
SMS_PROVIDER=bulksmsbd
SMS_API_KEY=your-private-key
SMS_SENDER_ID=your-approved-sender
```

The adapter submits a server-side HTTPS form and accepts only response code `202`, following the [BulkSMSBD API documentation](https://www.bulksmsbd.com/bulksms-api-bangladesh.php). Submission is not a handset delivery receipt.

## Other gateways and development

- `SMS_PROVIDER=generic` uses `SMS_API_URL` and an optional bearer `SMS_API_KEY`. The endpoint must explicitly return JSON `{ "accepted": true }` or `{ "success": true }`; HTTP 200 alone does not establish acceptance. Production requires HTTPS.
- With no provider configured, sending fails visibly. `SMS_PROVIDER=disabled` disables sending deliberately.
- `SMS_PROVIDER=console` is for local development only, logs the message deliberately, and refuses to simulate sending in production. No OTPs, recipient numbers or keys are logged by the production adapters.
- Restart the server after changing environment credentials. Do not configure automatic retry/failover for an uncertain submission without provider idempotency; that can send duplicate OTPs and incur extra charges.

## Login behavior

1. The initial login form offers email/password or phone/OTP, with no role buttons.
2. After password/OTP verification, one available role signs in automatically. Multiple available roles show a choice containing only that account's roles. Inactive rider access is excluded.
3. The selection uses a hashed, five-minute, single-use login challenge; the OTP is not reused and the password is not returned to the browser.
4. Invalid, expired or revoked choices cannot create a session.

OTP resend is limited to once per phone per minute, including simultaneous requests. A failed provider submission invalidates that code and shows a send failure. A successful submission means gateway acceptance; delivery receipts and a provider delivery-status dashboard remain separate future work.

The SMS adapter is also used for stock notifications. They are marked notified only when SMS submission is accepted; the existing email logger is not counted as delivered email.

## Validation and activation

`npm run test:auth` exercises credentials, role choices, OTP replay, concurrent sends and provider success/error responses in a disposable local database with mocked HTTP calls. No paid SMS is sent by this suite. `npm run test:orders` covers commerce/delivery regressions.

The login migration must be applied with `npm run db:deploy` before deploying the updated app. Live sending still requires provider credentials, an approved sender and available credit. No real SMS was sent during implementation.

Implementation validation on 20 October 2026: 15 authentication/SMS integration tests and 22 commerce regression tests passed; TypeScript, full lint and production build passed. Browser coverage uses a disposable Chrome session on debugging port 9223 and the local app on port 3000 (`npm run test:login:browser`). It verifies initial hidden roles, password failure, automatic single-role login, assigned multi-role choices, page-request persistence, cancellation and the selected session role. Temporary browser-test accounts are removed afterward. These tests use no paid SMS.
