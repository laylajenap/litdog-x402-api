// LitDog Token Facts API — x402 pay-per-call (v2) on Base mainnet.
// GET /v1/litdog  -> $0.01 USDC per call (exact scheme, eip155:8453, USDC Base)
// GET /openapi.json -> OpenAPI 3 document (free)
// GET /           -> service info (free)
// GET /health     -> health check (free)
//
// Stack: Express + @x402/express 2.30.0 + @x402/core 2.30.0 + @x402/evm 2.30.0
// Facilitator: PayAI public facilitator (https://facilitator.payai.network)
//   — supports v2 `exact` on eip155:8453 (Base mainnet), no API key required.
//   (x402.org facilitator is testnet-only; CDP facilitator needs API keys.)
// The middleware accepts both v2 `PAYMENT-SIGNATURE` and legacy v1 `X-PAYMENT`.
// Unpaid requests get HTTP 402 with BOTH:
//   - a JSON body containing `accepts` (v1-style, also what the task requires), and
//   - a `PAYMENT-REQUIRED` header (v2, base64 JSON) set by the middleware.
// No private keys, no wallet access, no funds are used by this server.

import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const PORT = Number(process.env.PORT || 4021);
const HOST = process.env.HOST || "127.0.0.1";

const PAY_TO = "0x322802F35688d3b73668E3E53dac5A339615e9ee";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const NETWORK = "eip155:8453"; // Base mainnet
const PRICE = "$0.01"; // = 10000 atomic USDC (6 decimals)
const AMOUNT_ATOMIC = "10000";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://facilitator.payai.network";

// --- Public LitDog facts (all public on-chain data) ---
const LITDOG_FACTS = {
  token: "LitDog",
  symbol: "LITDOG",
  contract: "0x30d57EFC8FC3e7461AAd6aA87616b496d51cA9Ff",
  standard: "ERC-20",
  chain: "LitVM LiteForge Testnet",
  chainId: 4441,
  decimals: 18,
  totalSupply: "1000000000",
  permissions: "Fixed Supply",
  deployer: "0x322802F35688d3b73668E3E53dac5A339615e9ee",
  deployedAt: "2026-11-10T02:51:50+07:00",
  deployTx: "0x3a5ec9a2424988a95bd418521e97ee8956942c806f6a705d2f42a8cca265807b",
  deployBlock: 69549984,
  factory: "0xf580E69687c07c0033FDfbF85623399E45a66E3a",
  contractVerified: true,
  contractVerifiedAt: "2026-11-10T05:14:25+07:00",
  explorer:
    "https://liteforge.explorer.caldera.xyz/address/0x30d57EFC8FC3e7461AAd6aA87616b496d51cA9Ff",
  pool: {
    dex: "LitVMSwap",
    pair: "0x99bf937c825544eb46840bdf705f3c9fe6757be1",
    pairToken: "LITDOG / zkLTC",
    reserves: { LITDOG: "100000000", zkLTC: "0.01" },
    price: "1 LITDOG = 1.00e-10 zkLTC",
  },
};

// --- OpenAPI 3 document (server URL is filled in per request) ---
function buildOpenApiDoc(baseUrl) {
  return {
    openapi: "3.0.3",
    info: {
      title: "LitDog Token Facts API",
      version: "1.0.0",
      description:
        "Pay-per-call API (x402) returning public facts about the LitDog (LITDOG) ERC-20 token on LitVM LiteForge Testnet. One call costs $0.01 USDC on Base (eip155:8453), paid via x402 (exact scheme). Without payment the endpoint answers HTTP 402 with payment requirements in the response body (`accepts`) and in the `PAYMENT-REQUIRED` header.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/v1/litdog": {
        get: {
          operationId: "getLitDogFacts",
          summary: "Get LitDog token facts",
          description:
            "Returns public facts about the LitDog (LITDOG) token: contract, chain, supply, deploy info and the LitVMSwap pool. Requires an x402 payment of $0.01 USDC on Base (eip155:8453) to 0x322802F35688d3b73668E3E53dac5A339615e9ee.",
          responses: {
            200: {
              description: "LitDog token facts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      token: { type: "string", example: "LitDog" },
                      symbol: { type: "string", example: "LITDOG" },
                      contract: {
                        type: "string",
                        example: "0x30d57EFC8FC3e7461AAd6aA87616b496d51cA9Ff",
                      },
                      chain: { type: "string", example: "LitVM LiteForge Testnet" },
                      chainId: { type: "integer", example: 4441 },
                      decimals: { type: "integer", example: 18 },
                      totalSupply: { type: "string", example: "1000000000" },
                      permissions: { type: "string", example: "Fixed Supply" },
                      deployer: {
                        type: "string",
                        example: "0x322802F35688d3b73668E3E53dac5A339615e9ee",
                      },
                      deployedAt: { type: "string", example: "2026-11-10T02:51:50+07:00" },
                      deployTx: { type: "string" },
                      deployBlock: { type: "integer", example: 69549984 },
                      factory: { type: "string" },
                      contractVerified: { type: "boolean", example: true },
                      explorer: { type: "string" },
                      pool: {
                        type: "object",
                        properties: {
                          dex: { type: "string", example: "LitVMSwap" },
                          pair: { type: "string" },
                          pairToken: { type: "string", example: "LITDOG / zkLTC" },
                          reserves: {
                            type: "object",
                            properties: {
                              LITDOG: { type: "string", example: "100000000" },
                              zkLTC: { type: "string", example: "0.01" },
                            },
                          },
                          price: { type: "string", example: "1 LITDOG = 1.00e-10 zkLTC" },
                        },
                      },
                    },
                  },
                },
              },
            },
            402: {
              description:
                "Payment required (x402). The response body contains `accepts` with scheme `exact`, network `eip155:8453`, amount `10000` (atomic USDC = $0.01), asset (USDC on Base) and payTo. The same requirements are in the `PAYMENT-REQUIRED` header (base64 JSON). Retry with a signed payment in the `PAYMENT-SIGNATURE` header (x402 v2) or `X-PAYMENT` header (x402 v1).",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      x402Version: { type: "integer", example: 2 },
                      error: { type: "string", example: "Payment required" },
                      resource: { type: "string", example: `${baseUrl}/v1/litdog` },
                      accepts: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            scheme: { type: "string", example: "exact" },
                            network: { type: "string", example: "eip155:8453" },
                            amount: { type: "string", example: "10000" },
                            asset: {
                              type: "string",
                              example: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                            },
                            payTo: {
                              type: "string",
                              example: "0x322802F35688d3b73668E3E53dac5A339615e9ee",
                            },
                            maxTimeoutSeconds: { type: "integer", example: 60 },
                            extra: {
                              type: "object",
                              properties: {
                                name: { type: "string", example: "USDC" },
                                version: { type: "string", example: "2" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

// --- x402 setup ---
const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  // Fail fast instead of the library default 90s: a healthy verify answers
  // in seconds (invalid signatures fail in ~3s); a hung verify is not
  // going to recover, so cap it at 30s.
  timeoutMs: 30000,
});
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  "eip155:*",
  new ExactEvmScheme(),
);

const app = express();
app.set("trust proxy", true); // behind cloudflared: honour X-Forwarded-Proto/Host
app.use(express.json());

// Free routes (no payment)
app.get("/", (_req, res) => {
  res.json({
    service: "LitDog Token Facts API",
    version: "1.0.0",
    payment: "x402",
    price: PRICE,
    network: NETWORK,
    asset: USDC_BASE,
    payTo: PAY_TO,
    endpoints: {
      facts: "GET /v1/litdog ($0.01 USDC per call, x402)",
      openapi: "GET /openapi.json (free)",
      health: "GET /health (free)",
    },
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/openapi.json", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json(buildOpenApiDoc(baseUrl));
});

// Paid route — x402 middleware handles 402 / verify / settle.
// unpaidResponseBody makes the 402 body carry the full `accepts` payload
// (the default v2 body is `{}`; requirements otherwise live only in the
// PAYMENT-REQUIRED header). The resource URL is taken from the live request
// so it always shows the public tunnel URL, not localhost.
app.use(
  paymentMiddleware(
    {
      "GET /v1/litdog": {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            price: PRICE,
            payTo: PAY_TO,
            maxTimeoutSeconds: 60,
          },
        ],
        description: "Public facts about the LitDog (LITDOG) token.",
        mimeType: "application/json",
        unpaidResponseBody: (context) => ({
          contentType: "application/json",
          body: {
            x402Version: 2,
            error: "Payment required",
            resource: {
              url: context.adapter.getUrl(),
              description: "Public facts about the LitDog (LITDOG) token.",
              mimeType: "application/json",
            },
            accepts: [
              {
                scheme: "exact",
                network: NETWORK,
                amount: AMOUNT_ATOMIC,
                asset: USDC_BASE,
                payTo: PAY_TO,
                maxTimeoutSeconds: 60,
                extra: { name: "USD Coin", version: "2" },
              },
            ],
          },
        }),
      },
    },
    resourceServer,
  ),
);

app.get("/v1/litdog", (_req, res) => {
  res.json(LITDOG_FACTS);
});

app.listen(PORT, HOST, () => {
  console.log(`[litdog-api] listening on http://${HOST}:${PORT}`);
  console.log(`[litdog-api] facilitator: ${FACILITATOR_URL}`);
  console.log(`[litdog-api] GET /v1/litdog -> ${PRICE} USDC on ${NETWORK} to ${PAY_TO}`);
});
