#!/usr/bin/env node
/**
 * Cobranza de recibos -- Etapa 2 (landing de pago + consentimientos).
 *
 * Requiere haber corrido antes `setup-payments.js` (tabla `TPayment`).
 *
 * 1) `ars_platform."TPaymentLink"`: el enlace público que recibe el tomador.
 *    - `DesTokenHash`: SHA-256 (hex) del token; el token en claro solo viaja en
 *      la URL del correo. 256 bits aleatorios, imposible de adivinar.
 *    - `CodStatus`: ENVIADO -> ABIERTO -> CONSENTIDO -> PAGADO | VENCIDO | CANCELADO.
 *    - `IdeReceipt`: recibo principal que se cobra (el primero del contrato).
 *    - `TstExpires`: vencimiento (por defecto 7 días, `PAYMENT_LINK_TTL_DAYS`).
 *
 * 2) `ars_platform."SProductConsent"`: qué consentimientos del catálogo
 *    (`SConsent`) debe aceptar el tomador, por producto y por acción
 *    (`CodAction`, hoy solo 'PAGO'). Se administra en Productos > Consentimientos.
 *
 * 3) Amplía `TPersonConsent` (aceptación de un consentimiento) con la
 *    evidencia que pide el RGPD: cuándo, desde qué IP/navegador, con qué
 *    texto exacto (`DesConsentSnapshot`) y a través de qué enlace.
 *
 * 4) `TPayment.IdePaymentLink`: de qué enlace salió el intento de cobro.
 *
 * Idempotente. Después de correrlo:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 * (el código usa SQL crudo para estas tablas, así que compila igual antes de eso).
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/setup-payment-links.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');

    const hasPayment = await client.query(`SELECT to_regclass('ars_platform."TPayment"') AS t`);
    if (!hasPayment.rows[0].t) throw new Error('Falta la tabla TPayment -- corré primero setup-payments.js');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ars_platform."TPaymentLink" (
        "IdePaymentLink" uuid NOT NULL DEFAULT gen_random_uuid(),
        "IdeContract" uuid NOT NULL,
        "IdeReceipt" uuid NOT NULL,
        "IdePerson" uuid,
        "DesEmail" varchar,
        "DesTokenHash" varchar(64) NOT NULL,
        "CodStatus" varchar(20) NOT NULL DEFAULT 'ENVIADO',
        "TstExpires" timestamp(6) NOT NULL,
        "TstSent" timestamp(6),
        "TstOpened" timestamp(6),
        "TstConsented" timestamp(6),
        "TstPaid" timestamp(6),
        "UsrCreation" varchar(60) NOT NULL,
        "TstCreation" timestamp(6) NOT NULL,
        "UsrModification" varchar(60) NOT NULL,
        "TstModification" timestamp(6) NOT NULL,
        CONSTRAINT "PK_TPaymentLink" PRIMARY KEY ("IdePaymentLink"),
        CONSTRAINT "UK_TPaymentLink_TokenHash" UNIQUE ("DesTokenHash"),
        CONSTRAINT "FK_TPaymentLink_TContract" FOREIGN KEY ("IdeContract") REFERENCES ars_platform."TContract" ("IdeContract"),
        CONSTRAINT "FK_TPaymentLink_TReceipt" FOREIGN KEY ("IdeReceipt") REFERENCES ars_platform."TReceipt" ("IdeReceipt"),
        CONSTRAINT "CK_TPaymentLink_CodStatus"
          CHECK ("CodStatus" IN ('ENVIADO', 'ABIERTO', 'CONSENTIDO', 'PAGADO', 'VENCIDO', 'CANCELADO'))
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS "IX_TPaymentLink_IdeContract" ON ars_platform."TPaymentLink" ("IdeContract", "TstCreation" DESC)`,
    );
    console.log('= TPaymentLink lista');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ars_platform."SProductConsent" (
        "IdeProductConsent" uuid NOT NULL DEFAULT gen_random_uuid(),
        "IdeProduct" uuid NOT NULL,
        "IdeConsent" uuid NOT NULL,
        "CodAction" varchar(30) NOT NULL DEFAULT 'PAGO',
        "UsrCreation" varchar(60) NOT NULL,
        "TstCreation" timestamp(6) NOT NULL,
        "UsrModification" varchar(60) NOT NULL,
        "TstModification" timestamp(6) NOT NULL,
        CONSTRAINT "PK_SProductConsent" PRIMARY KEY ("IdeProductConsent"),
        CONSTRAINT "UK_SProductConsent_01" UNIQUE ("IdeProduct", "IdeConsent", "CodAction"),
        CONSTRAINT "FK_SProductConsent_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct" ("IdeProduct"),
        CONSTRAINT "FK_SProductConsent_SConsent" FOREIGN KEY ("IdeConsent") REFERENCES ars_platform."SConsent" ("IdeConsent")
      )
    `);
    console.log('= SProductConsent lista');

    for (const col of [
      `"TstAccepted" timestamp(6)`,
      `"DesIp" varchar`,
      `"DesUserAgent" varchar`,
      `"DesConsentSnapshot" jsonb`,
      `"IdePaymentLink" uuid`,
    ]) {
      await client.query(`ALTER TABLE ars_platform."TPersonConsent" ADD COLUMN IF NOT EXISTS ${col}`);
    }
    await client.query(`ALTER TABLE ars_platform."TPayment" ADD COLUMN IF NOT EXISTS "IdePaymentLink" uuid`);
    console.log('= TPersonConsent y TPayment ampliadas');

    await client.query('COMMIT');
    console.log('OK. Cobranza (etapa 2) lista.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
