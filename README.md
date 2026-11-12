# LitDog x402 API — vAPI "List your API" (500 pts)

API pay-per-call minimal untuk didaftarkan di vAPI
(`api.vapinetwork.ai/call/my-apis/new`, quest **"List your API"**, 500 poin).
Satu operasi: fakta publik token LitDog. Harga **$0,01 USDC** per panggilan,
network **Base (`eip155:8453`)**, payTo wallet user
`0x322802F35688d3b73668E3E53dac5A339615e9ee`.

> **STATUS — 10 Nov 2026 ~08:15 WIB:** server jalan & teruji penuh secara lokal,
> TAPI **belum ada URL HTTPS publik**. Semua mekanisme tunnel tanpa-akun dari VM
> ini diblokir oleh egress proxy sandbox (lihat "Blocker: URL publik" di bawah).
> Jangan submit ke vAPI sebelum ada URL publik yang live.

> **UPDATE — 12 Nov 2026 ~08:25 WIB:** server di-restart (jalan lagi, `/health` ok,
> `/v1/litdog` 402). cloudflared dicoba ulang 3× (SSL_CERT_FILE, system CA store,
> debug) — tetap gagal; dibuktikan definitif mengabaikan proxy. Menunggu keputusan
> user: ngrok (butuh authtoken gratis dari user) atau deploy ke PaaS via GitHub.
>
> **UPDATE — 12 Nov 2026 ~08:37 WIB:** Render DIBLOKIR — deploy gratis minta kartu
> kredit (hold sementara $1, dialog "Add Card"). Form deploy sudah terisi lengkap,
> tidak ada kartu dimasukkan, service belum dibuat. Beralih ke Vercel Hobby (tanpa
> kartu): tambah wrapper serverless `api/index.js` + `vercel.json`; `server.mjs`
> sekarang export app & `listen` hanya saat dijalankan langsung (`node server.mjs`).

## Endpoints (server lokal: http://127.0.0.1:4021)

| Method | Path | Harga | Keterangan |
|---|---|---|---|
| GET | `/v1/litdog` | $0,01 USDC | Fakta LitDog (nama, simbol, kontrak, chain, supply, pool). Tanpa bayar → **402**. |
| GET | `/openapi.json` | gratis | Dokumen OpenAPI 3.0.3 (URL server diisi dinamis dari host request). |
| GET | `/health` | gratis | `{"status":"ok"}` |
| GET | `/` | gratis | Info service. |

Data yang dikembalikan `/v1/litdog`: nama `LitDog`, simbol `LITDOG`, kontrak
`0x30d57EFC8FC3e7461AAd6aA87616b496d51cA9Ff`, chain LitVM LiteForge Testnet 4441,
total supply 1.000.000.000, pool LITDOG/zkLTC di LitVMSwap
(pair `0x99bf937c825544eb46840bdf705f3c9fe6757be1`).

## Menjalankan server

```bash
cd ~/workspace/vapi-api
setsid nohup env NODE_EXTRA_CA_CERTS=/run/hatch/egress-tls/ca-bundle.pem \
  node server.mjs > server.log 2>&1 < /dev/null &
echo $! > server.pid
```

- **PID saat ini:** lihat `server.pid` (terakhir: 3357, restart 10 Nov ~01:00 WIB
  setelah service VM restart; server harus di-restart manual bila VM restart).
- **Log:** `server.log`. **Kode:** `server.mjs`. **Deps:** `package.json`
  (`@x402/express` 2.30.0, `@x402/core` 2.30.0, `@x402/evm` 2.30.0, `express`).
- Facilitator: **PayAI** `https://facilitator.payai.network`
  (timeout 30 dtk; dikonfigurasi di `server.mjs` → `FACILITATOR_URL`).
- x402 v2. Header pembayaran: `PAYMENT-SIGNATURE` (v2; header legacy `X-PAYMENT`
  **tidak** dibaca oleh middleware ini — lihat "Batasan" di bawah).

## Respons 402 (teramati, tanpa pembayaran)

`GET /v1/litdog` → `HTTP 402 Payment Required`, header `PAYMENT-REQUIRED`
(base64url dari body yang sama persis) dan body:

```json
{"x402Version":2,"error":"Payment required","resource":{"url":"http://127.0.0.1:4021/v1/litdog","description":"Public facts about the LitDog (LITDOG) token.","mimeType":"application/json"},"accepts":[{"scheme":"exact","network":"eip155:8453","amount":"10000","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","payTo":"0x322802F35688d3b73668E3E53dac5A339615e9ee","maxTimeoutSeconds":60,"extra":{"name":"USD Coin","version":"2"}}]}
```

(`resource.url` mengikuti host request — lewat URL publik akan berisi URL publik.)

## Jalur berbayar — TERUJI sampai cek saldo on-chain (10 Nov ~01:05 WIB)

Skrip uji: `test/paid-path.mjs` (wallet throwaway dibuat fresh tiap run,
**tidak ada dana, tidak ada kunci tersimpan**; butuh `ethers` devDep).
Jalankan: `NODE_EXTRA_CA_CERTS=/run/hatch/egress-tls/ca-bundle.pem node test/paid-path.mjs`

Hasil terakhir (payer throwaway `0x031b...`):
- **v2 `PAYMENT-SIGNATURE` → 402 `{"error":"invalid_exact_evm_insufficient_balance"}` (882 ms).**
  Artinya: signature EIP-3009 **valid**, facilitator PayAI memverifikasi &
  me-recover payer dengan benar, lalu menolak karena saldo USDC payer = 0.
  **Dengan payer yang terdanai, panggilan ini akan lolos (200 + data).**
  Direct `POST /verify` ke PayAI: `200 {"isValid":false,"invalidReason":"invalid_exact_evm_insufficient_balance","payer":"0x031b..."}` (574 ms).
- **Dexter** (`https://x402.dexter.cash`, v2 exact di `eip155:8453`): direct `/verify`
  → `503 {"isValid":false,"invalidCode":"policy:price_unavailable","invalidReason":"Current settlement pricing is unavailable; retry shortly."}` — masih down
  (konsisten sejak 05:47 WIB). Cadangan saja, bukan primer.
- **v1 legacy tidak didukung**: payload v1 via `PAYMENT-SIGNATURE` →
  `402 {"error":"unsupported_x402_version: x402Version 1 requires V1 network format, got 'eip155:8453'"}`.
  vAPI memakai v2, jadi ini bukan blocker untuk listing.

Catatan penting: payload pembayaran v2 **wajib** menyertakan field `accepted`
(isi = objek requirements dari 402). Tanpa `accepted`, middleware menolak
dengan `"No matching payment requirements"` dan facilitator menolak dengan
`invalid_payload`. Ini jebakan spesifikasi v2 yang sudah diperbaiki di skrip uji.

## Koreksi alamat USDC Base (PENTING)

Alamat USDC Base yang benar: **`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`**
(berakhir `...A02913`). Alamat `...029029` yang sempat beredar adalah SALAH
(tidak ada kontrak di sana — `eth_getCode` = `0x`). Sudah diperbaiki di
`server.mjs` dan OpenAPI. Jangan pakai `...029029` di mana pun.

## Blocker: URL publik (TIDAK ADA — semua tunnel gagal)

VM ini tidak punya IP publik inbound; outbound hanya lewat egress proxy
HTTP(S) dengan TLS MITM (CA `/run/hatch/egress-tls/ca-bundle.pem`).
Proxy ini memblokir semua mekanisme tunnel tanpa-akun yang dicoba
(10 Nov 05:47–08:00 WIB):

| Mekanisme | Hasil |
|---|---|
| **cloudflared quick tunnel** (`api.trycloudflare.com`) | **DEFINITIF GAGAL (12 Nov):** `POST /tunnel` → `tls: first record does not look like a TLS handshake`. Dibuktikan cloudflared **mengabaikan proxy** (env HTTPS_PROXY diganti ke proxy mati 127.0.0.1:9, error tetap sama & instan) — koneksi langsung diblokir sandbox. curl + `--cacert` ke endpoint yang sama berhasil (200, tunnel terbuat) — jadi bukan masalah CA. **Jangan coba cloudflared lagi dari VM ini.** |
| **localhost.run SSH :22** | `Connection reset by 198.19.0.1 port 3128` (proxy). |
| **localhost.run SSH :443** | Port 443 di sana = server HTTPS (200), bukan SSH. |
| **pinggy SSH :443** | `a.pinggy.io` tidak terjangkau via proxy (curl 000); banner timeout. |
| **bore** (`bore.pub:7835`) | CONNECT ke port non-443 hang. |
| **localtunnel** | Data plane raw TCP ke port tinggi (25635) hang; client juga sempat hang tanpa output. |
| **tunnelmole** (`wss://service.tunnelmole.com:8083`) | CONNECT+TLS ke :8083 OK (curl 426), tapi **WebSocket Upgrade hang** — proxy tidak mendukung Upgrade (diuji juga via curl + Node `ws` + built-in WebSocket). |
| **smee.io** | SSE connect OK, tapi GET = stream/UI (tidak di-forward) dan **POST hang** (000/20 dtk). |
| **Tailscale Funnel** | Tidak tersedia: client-only, subcommand `funnel` tidak ada (dilarang oleh connector doc). |

**Jalur ke depan (butuh keputusan user/parent):**
1. **Deploy ke PaaS gratis** (Vercel / Render / Railway / Fly.io) — butuh akun
   (mis. via GitHub user `laylajenap`). Kode ini aplikasi Express biasa,
   gampang di-deploy; `server.mjs` listen di `PORT` (default 4021).
   Lalu submit URL publik itu ke form vAPI.
2. **ngrok** — butuh akun gratis + authtoken dari user; protokolnya TLS ke :443
   (kemungkinan lolos proxy, belum teruji).
3. **Jalankan tunnel dari jaringan lain** (tanpa egress proxy ini) dengan
   perintah: `./bin/cloudflared tunnel --url http://127.0.0.1:4021`
   (binary sudah ada di `bin/cloudflared` v2026.10.7).
4. ~~Coba lagi cloudflared nanti~~ — **SUDAH TERBUKTI tidak bisa (12 Nov, lihat tabel di atas). Jangan buang waktu retry.**

**Yang TIDAK boleh dilakukan:** submit apa pun ke vAPI sebelum URL publik live
dan teruji (402 + `/openapi.json` lewat URL publik); menyentuh wallet user;
mengeluarkan USDC.

## File

- `server.mjs` — server Express + x402.
- `server.pid`, `server.log` — proses & log server.
- `tunnel.log`, `tunnel.pid` — log/PID percobaan tunnel terakhir (smee, sudah dimatikan).
- `bin/cloudflared` — binary cloudflared v2026.10.7 (untuk dipakai di jaringan lain).
- `test/paid-path.mjs` — uji jalur berbayar (throwaway wallet, tanpa dana).
- `package.json` — deps (`@x402/*` 2.30.0, `express`, devDep `ethers` 6).
