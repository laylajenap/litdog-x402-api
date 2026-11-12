// Paid-path test for the LitDog x402 API.
// Uses a FRESH random throwaway wallet each run (unfunded, no key stored).
// Tests: (A) v2 PAYMENT-SIGNATURE, (B) v1 X-PAYMENT (network "base"),
// (C) direct PayAI /verify, (D) direct Dexter /verify.
// Expectation: all fail at the facilitator's on-chain check (unfunded payer)
// or time out -- a fast signature-rejection would also be informative.
// Run: NODE_EXTRA_CA_CERTS=/run/hatch/egress-tls/ca-bundle.pem node test/paid-path.mjs
import { ethers } from 'ethers';

const BASE = 'http://127.0.0.1:4021';
const PAYAI = 'https://facilitator.payai.network/verify';
const DEXTER = 'https://x402.dexter.cash/verify';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

async function fetchJSON(url, opts = {}, timeoutMs = 35000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, ms: Date.now() - start, body: text.slice(0, 600) };
  } catch (e) {
    return { status: 'ERR', ms: Date.now() - start, body: `${e.name}: ${e.message}`.slice(0, 300) };
  } finally {
    clearTimeout(t);
  }
}

function buildAuth(wallet, req, now) {
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const authorization = {
    from: wallet.address,
    to: req.payTo,
    value: req.amount,
    validAfter: '0',
    validBefore: String(now + Number(req.maxTimeoutSeconds)),
    nonce,
  };
  return authorization;
}

async function signAuth(wallet, req, authorization) {
  const domain = {
    name: req.extra.name,
    version: req.extra.version,
    chainId: 8453,
    verifyingContract: req.asset,
  };
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };
  const message = {
    from: authorization.from,
    to: authorization.to,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce,
  };
  return wallet.signTypedData(domain, types, message);
}

const now = Math.floor(Date.now() / 1000);
const wallet = ethers.Wallet.createRandom();
console.log('throwaway payer:', wallet.address);

// 1. Get the 402 challenge
const c402 = await fetchJSON(`${BASE}/v1/litdog`, {}, 10000);
console.log('\n[0] GET /v1/litdog (no payment):', c402.status, `(${c402.ms}ms)`);
const accepts = JSON.parse(c402.body).accepts[0];
console.log('    accepts:', JSON.stringify(accepts));

// 2a. v2 PAYMENT-SIGNATURE
const authV2 = buildAuth(wallet, accepts, now);
const sigV2 = await signAuth(wallet, accepts, authV2);
const payV2 = { x402Version: 2, scheme: 'exact', network: 'eip155:8453', payload: { authorization: authV2, signature: sigV2 }, accepted: accepts };
const rV2 = await fetchJSON(`${BASE}/v1/litdog`, { headers: { 'PAYMENT-SIGNATURE': b64url(payV2) } }, 40000);
console.log('\n[A] v2 PAYMENT-SIGNATURE:', rV2.status, `(${rV2.ms}ms)`);
console.log('    body:', rV2.body);

// 2b. v1 payload (network "base") -- sent via PAYMENT-SIGNATURE, because the
// v2 middleware's extractPayment() reads ONLY that header (X-PAYMENT is
// ignored for incoming payments in @x402/core 2.30.0).
const authV1 = buildAuth(wallet, accepts, now);
const sigV1 = await signAuth(wallet, accepts, authV1);
const payV1 = { x402Version: 1, scheme: 'exact', network: 'base', payload: { authorization: authV1, signature: sigV1 }, accepted: accepts };
const rV1 = await fetchJSON(`${BASE}/v1/litdog`, { headers: { 'PAYMENT-SIGNATURE': b64url(payV1) } }, 40000);
console.log('\n[B] v1 payload via PAYMENT-SIGNATURE (network base):', rV1.status, `(${rV1.ms}ms)`);
console.log('    body:', rV1.body);

// 3. Direct facilitator /verify (v2 payload)
const verifyBody = { x402Version: 2, paymentPayload: payV2, paymentRequirements: accepts };
for (const [name, url] of [['PayAI', PAYAI], ['Dexter', DEXTER]]) {
  const r = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyBody),
  }, 65000);
  console.log(`\n[${name}] POST /verify (direct):`, r.status, `(${r.ms}ms)`);
  console.log('    body:', r.body);
}
console.log('\nDone.');
