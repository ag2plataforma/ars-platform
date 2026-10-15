#!/usr/bin/env node
/**
 * Solo lectura. Radiografía de las reglas de cálculo de un Plan x Riesgo, para entender por qué una
 * cotización da importe solo en algunas coberturas o siempre el mismo valor.
 *
 * Para cada Plan x Riesgo cuyo "Plan / Riesgo" contenga los textos pedidos muestra, por cobertura del plan:
 *   - las reglas que le aplican (Orden, código, concepto, columna destino, estado, IF/THEN/ELSE) y avisa de
 *     las coberturas SIN reglas activas (el motor no calcula nada para ellas);
 *   - las tablas de tarifa que usan las fórmulas (filas y vigencia);
 *   - la última cotización de ese Plan x Riesgo: importe/tasa/prima de cada cobertura, sus conceptos y los
 *     valores de campos personalizados del riesgo.
 *
 * Uso (en la VPS, desde ~/ars-platform/deploy):
 *   bash scripts/db-run.sh investigate-product-rules.js "Viajes en España" "Viajes"
 *   (1er argumento: texto del plan; 2º, opcional: texto del riesgo; sin distinguir mayúsculas)
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const content = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('No se encontro DATABASE_URL');
  return match[1].trim();
}

const S = 'ars_platform';
const fmt = (v) => (v === null || v === undefined ? '-' : String(v));

async function main() {
  const [planText, riskText] = process.argv.slice(2);
  if (!planText) throw new Error('Uso: investigate-product-rules.js "<texto del plan>" ["<texto del riesgo>"]');
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const pprs = (
      await client.query(
        `SELECT ppr."IdePlanProductRisk", pp."DesPlanProduct", r."DesRisk", rp."IdeRiskProduct", p."IdeProduct", p."CodProduct", p."DesProduct"
           FROM ${S}."SPlanProductRisk" ppr
           JOIN ${S}."SPlanProduct" pp ON pp."IdePlanProduct" = ppr."IdePlanProduct"
           JOIN ${S}."SProduct" p ON p."IdeProduct" = pp."IdeProduct"
           JOIN ${S}."SRiskProduct" rp ON rp."IdeRiskProduct" = ppr."IdeRiskProduct"
           JOIN ${S}."SRisk" r ON r."IdeRisk" = rp."IdeRisk"
          WHERE pp."DesPlanProduct" ILIKE $1 AND r."DesRisk" ILIKE $2
          ORDER BY 1`,
        [`%${planText}%`, `%${riskText ?? ''}%`],
      )
    ).rows;
    if (pprs.length === 0) {
      console.log('No hay ningun Plan x Riesgo que coincida.');
      return;
    }

    for (const ppr of pprs) {
      console.log(`\n################ ${ppr.DesProduct} (${ppr.CodProduct}) :: ${ppr.DesPlanProduct} / ${ppr.DesRisk}`);
      const cps = (
        await client.query(
          `SELECT cp."IdeCoveragePlan", c."CodCoverage", c."DesCoverage", cp."IndMandatory", st."CodState"
             FROM ${S}."SCoveragePlan" cp
             JOIN ${S}."SCoverage" c ON c."IdeCoverage" = cp."IdeCoverage"
             LEFT JOIN ${S}."SState" st ON st."IdeState" = cp."IdeState"
            WHERE cp."IdePlanProductRisk" = $1 ORDER BY c."CodCoverage"`,
          [ppr.IdePlanProductRisk],
        )
      ).rows;
      const tablesUsed = new Set();
      for (const cp of cps) {
        const rules = (
          await client.query(
            `SELECT r."CodCalculationRule", r."DesCalculationRule", r."Order", r."DesColumnName", r."FormulaJSON",
                    r."IdeProduct", r."IdePlanProductRisk", c."CodConcept", st."CodState"
               FROM ${S}."SCalculationRule" r
               JOIN ${S}."SConcept" c ON c."IdeConcept" = r."IdeConcept"
               LEFT JOIN ${S}."SState" st ON st."IdeState" = r."IdeState"
              WHERE r."IdeCoveragePlan" = $1 ORDER BY r."Order"`,
            [cp.IdeCoveragePlan],
          )
        ).rows;
        console.log(`\n== Cobertura ${cp.CodCoverage} — ${cp.DesCoverage} [${cp.CodState ?? '?'}${cp.IndMandatory ? ', obligatoria' : ''}]`);
        const applicable = rules.filter(
          (r) =>
            r.CodState === 'ACTIVO' &&
            (r.IdeProduct === null || r.IdeProduct === ppr.IdeProduct) &&
            (r.IdePlanProductRisk === null || r.IdePlanProductRisk === ppr.IdePlanProductRisk),
        );
        if (applicable.length === 0) console.log('   !! SIN REGLAS ACTIVAS: el motor no calcula nada para esta cobertura.');
        for (const r of rules) {
          const f = r.FormulaJSON ?? {};
          const scope =
            (r.IdeProduct && r.IdeProduct !== ppr.IdeProduct) || (r.IdePlanProductRisk && r.IdePlanProductRisk !== ppr.IdePlanProductRisk)
              ? ' (de OTRO producto/plan: no aplica)'
              : '';
          console.log(`   #${r.Order} ${r.CodCalculationRule} [${r.CodState}] concepto=${r.CodConcept} col=${fmt(r.DesColumnName)}${scope}`);
          console.log(`      IF   : ${fmt(f.IF)}`);
          console.log(`      THEN : ${fmt(f.THEN)}`);
          console.log(`      ELSE : ${fmt(f.ELSE)}`);
          for (const k of ['IF', 'THEN', 'ELSE']) {
            for (const m of String(f[k] ?? '').matchAll(/FGetRateValue"?\(\s*'([^']*)'/gi)) tablesUsed.add(m[1]);
          }
        }
      }

      if (tablesUsed.size > 0) {
        console.log('\n== Tablas de tarifa usadas por las formulas');
        for (const cod of tablesUsed) {
          const t = await client.query(
            `SELECT count(*)::int AS n, min(v."TstInit") AS desde, max(v."TstEnd") AS hasta, count(DISTINCT v."Value")::int AS distintos, min(v."Value") AS vmin, max(v."Value") AS vmax
               FROM ${S}."SRateValue" v JOIN ${S}."SRateTable" t ON t."IdeRateTable" = v."IdeRateTable" WHERE t."CodRateTable" = $1`,
            [cod],
          );
          const x = t.rows[0];
          console.log(`   ${cod}: ${x.n} filas, ${x.distintos} valores distintos (${fmt(x.vmin)}..${fmt(x.vmax)}), vigencia ${x.desde ? x.desde.toISOString().slice(0, 10) : '-'}..${x.hasta ? x.hasta.toISOString().slice(0, 10) : '-'}`);
        }
      }

      const q = (
        await client.query(
          `SELECT q."NumQuote", q."TstCreation", qr."IdeQuoteRisk", qr."RiskAttributeValue", qrp."IdeQuoteRiskPlan"
             FROM ${S}."TQuoteRiskPlan" qrp
             JOIN ${S}."TQuoteRisk" qr ON qr."IdeQuoteRisk" = qrp."IdeQuoteRisk"
             JOIN ${S}."TQuote" q ON q."IdeQuote" = qr."IdeQuote"
            WHERE qrp."IdePlanProductRisk" = $1 ORDER BY q."TstCreation" DESC LIMIT 1`,
          [ppr.IdePlanProductRisk],
        )
      ).rows[0];
      if (!q) {
        console.log('\n(No hay cotizaciones de este Plan x Riesgo.)');
        continue;
      }
      console.log(`\n== Ultima cotizacion ${q.NumQuote} (${q.TstCreation.toISOString().slice(0, 16)})`);
      const attrs = q.RiskAttributeValue ?? {};
      for (const [ideProp, val] of Object.entries(attrs)) {
        const prop = await client.query(
          `SELECT ap."CodAttributeProperty", d."CodFieldDictionary" FROM ${S}."SAttributeProperty" ap
             JOIN ${S}."SAttribute" a ON a."IdeAttribute" = ap."IdeAttribute"
             JOIN ${S}."SFieldDictionary" d ON d."IdeFieldDictionary" = a."IdeFieldDictionary"
            WHERE ap."IdeAttributeProperty" = $1`,
          [ideProp],
        );
        let shown = String(val);
        const fv = await client.query(`SELECT "CodFieldValue" FROM ${S}."SFieldValue" WHERE "IdeFieldValue"::text = $1`, [String(val)]);
        if (fv.rows[0]) shown = `${fv.rows[0].CodFieldValue} (${val})`;
        console.log(`   campo ${prop.rows[0]?.CodFieldDictionary ?? ideProp} = ${shown}`);
      }
      const covs = (
        await client.query(
          `SELECT qc."IdeQuoteCoverage", c."CodCoverage", qc."Amount", qc."Rate", qc."Prime", qc."IndSelected"
             FROM ${S}."TQuoteCoverage" qc
             JOIN ${S}."SCoveragePlan" cp ON cp."IdeCoveragePlan" = qc."IdeCoveragePlan"
             JOIN ${S}."SCoverage" c ON c."IdeCoverage" = cp."IdeCoverage"
            WHERE qc."IdeQuoteRiskPlan" = $1 ORDER BY c."CodCoverage"`,
          [q.IdeQuoteRiskPlan],
        )
      ).rows;
      for (const c of covs) {
        const concepts = (
          await client.query(
            `SELECT k."CodConcept", qcc."ConceptValue" FROM ${S}."TQuoteCoverageConcept" qcc
               JOIN ${S}."SConcept" k ON k."IdeConcept" = qcc."IdeConcept" WHERE qcc."IdeQuoteCoverage" = $1 ORDER BY 1`,
            [c.IdeQuoteCoverage],
          )
        ).rows;
        console.log(
          `   ${c.CodCoverage}: importe=${c.Amount} tasa=${c.Rate} prima=${c.Prime} sel=${c.IndSelected}  conceptos: ${concepts.map((x) => `${x.CodConcept}=${x.ConceptValue}`).join(', ') || '(ninguno)'}`,
        );
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
