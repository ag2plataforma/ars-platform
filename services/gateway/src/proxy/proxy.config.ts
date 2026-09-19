/**
 * Mapa de servicios reales que el gateway conoce y a dónde reenviarles.
 * `envVar` es la variable de entorno que fija la URL real en cada
 * ambiente (Render, Oracle, etc.); `defaultUrl` es el puerto local que
 * usa cada servicio en desarrollo (ver `.env.example` de cada uno).
 */
export const PROXY_TARGETS = {
  iam: { envVar: 'IAM_SERVICE_URL', defaultUrl: 'http://localhost:3001' },
  'product-rating': { envVar: 'PRODUCT_RATING_SERVICE_URL', defaultUrl: 'http://localhost:3002' },
  party: { envVar: 'PARTY_SERVICE_URL', defaultUrl: 'http://localhost:3003' },
  'reference-data': { envVar: 'REFERENCE_DATA_SERVICE_URL', defaultUrl: 'http://localhost:3004' },
  underwriting: { envVar: 'UNDERWRITING_SERVICE_URL', defaultUrl: 'http://localhost:3005' },
  claims: { envVar: 'CLAIMS_SERVICE_URL', defaultUrl: 'http://localhost:3006' },
  billing: { envVar: 'BILLING_SERVICE_URL', defaultUrl: 'http://localhost:3007' },
} as const;

export type ProxyServiceKey = keyof typeof PROXY_TARGETS;
