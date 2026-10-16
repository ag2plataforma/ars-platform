#!/usr/bin/env node
/**
 * Mueve campos personalizados de un producto desde el nivel RIESGO al nivel PRODUCTO (ver
 * docs/02-roadmap.md, "Hallazgos de las pruebas", punto 12). Caso tipico: en "Asistencia en Viajes" los
 * campos "dias", "tipo de viaje" y "zona" son datos generales de la cotizacion (iguales para todos los
 * viajeros), no de cada riesgo.
 *
 * Que hace: re-apunta cada `SAttributeProperty` elegido desde el `SModelAttribute` del riesgo hacia un
 * `SModelAttribute` del producto (se crea si no existe, con `IdeReference = IdeProduct` y la entidad
 * `SProduct`). El `IdeAttributeProperty` (la clave del JSON de valores) NO cambia, asi que:
 *   - las formulas y tokens siguen funcionando (van por codigo de diccionario);
 *   - las cotizaciones y contratos viejos, con el valor guardado en el JSON del riesgo, se siguen
 *     tarifando (el motor busca primero en el riesgo y luego en los valores del producto).
 *
 * Uso (en la VPS, desde ~/ars-platform/deploy). SIN `--apply` solo lista y no cambia nada:
 *   bash scripts/db-run.sh move-risk-fields-to-product.js "Asistencia en Viajes"
 *   bash scripts/db-run.sh move-risk-fields-to-product.js "Asistencia en Viajes" --labels "dias,tipo,zona" --apply
 *
 *   1er argumento: texto del codigo o descripcion del producto (sin distinguir mayusculas ni acentos).
 *   --labels: textos (separados por coma) que deben contener las etiquetas de los campos a mover.
 *   --apply: ejecuta el cambio (en una transaccion).
 * Idempotente: un campo que ya esta a nivel producto no se vuelve a mover.
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
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function labelOf(row) {
  try {
    const content = JSON.parse(row.AttributeContent);
    if (content && typeof content.label === 'string') return content.label;
  } catch {
    /* se usa la descripcion */
  }
  return row.DesAttributeProperty;
}

async function main() {
  const productText = process.argv[2];
  if (!productText || productText.startsWith('--')) {
    throw new Error('Uso: move-risk-fields-to-product.js "<producto>" [--labels "a,b,c"] [--apply]');
  }
  const labels = (arg('--labels') ?? '').split(',').map((l) => norm(l.trim())).filter(Boolean);
  const apply = process.argv.includes('--apply');

  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const products = (await client.query(`SELECT "IdeProduct","CodProduct","DesProduct" FROM ${S}."SProduct" ORDER BY "DesProduct"`)).rows;
    const want = norm(productText);
    const matches = products.filter((p) => norm(p.CodProduct).includes(want) || norm(p.DesProduct).includes(want));
    if (matches.length !== 1) {
      console.log(matches.length === 0 ? 'Ningun producto coincide. Productos:' : 'Mas de un producto coincide, se mas especifico:');
      for (const p of matches.length ? matches : products) console.log(`  ${p.CodProduct}  ${p.DesProduct}`);
      return;
    }
    const product = matches[0];
    console.log(`Producto: ${product.CodProduct} - ${product.DesProduct}\n`);

    const props = (
      await client.query(
        `SELECT ap."IdeAttributeProperty", ap."CodAttributeProperty", ap."DesAttributeProperty", ap."AttributeContent",
                ap."CodStage", st."CodState", ma."IdeModelAttribute", ma."CodModelAttribute", ma."IdeReference",
                e."CodEntity", rp."CodRiskProduct"
           FROM ${S}."SAttributeProperty" ap
           JOIN ${S}."SModelAttribute" ma ON ma."IdeModelAttribute" = ap."IdeModelAttribute"
           JOIN ${S}."SEntity" e ON e."IdeEntity" = ma."IdeEntityReference"
           JOIN ${S}."SState" st ON st."IdeState" = ap."IdeState"
           LEFT JOIN ${S}."SRiskProduct" rp ON rp."IdeRiskProduct" = ma."IdeReference"
          WHERE ma."IdeReference" = $1 OR rp."IdeProduct" = $1
          ORDER BY ma."CodModelAttribute", ap."TstCreation"`,
        [product.IdeProduct],
      )
    ).rows;
    if (props.length === 0) {
      console.log('El producto no tiene campos personalizados.');
      return;
    }

    const isRiskLevel = (p) => p.IdeReference !== product.IdeProduct;
    const chosen = [];
    for (const p of props) {
      const label = labelOf(p);
      const level = isRiskLevel(p) ? `riesgo ${p.CodRiskProduct}` : 'PRODUCTO';
      const selected = isRiskLevel(p) && labels.length > 0 && labels.some((l) => norm(label).includes(l));
      if (selected) chosen.push(p);
      console.log(`${selected ? '[MOVER] ' : '        '}${label}  (${p.CodAttributeProperty}, ${p.CodState}, etapa ${p.CodStage}) - nivel: ${level}`);
    }

    if (labels.length === 0) {
      console.log('\nPara mover campos indica --labels "texto1,texto2" (parte de la etiqueta) y --apply.');
      return;
    }
    if (chosen.length === 0) {
      console.log('\nNingun campo de nivel riesgo coincide con --labels (o ya estan a nivel producto).');
      return;
    }
    if (!apply) {
      console.log(`\nSimulacion: se moverian ${chosen.length} campo(s) a nivel producto. Agrega --apply para ejecutar.`);
      return;
    }

    await client.query('BEGIN');
    try {
      let model = (
        await client.query(
          `SELECT ma."IdeModelAttribute" FROM ${S}."SModelAttribute" ma
            WHERE ma."IdeReference" = $1 ORDER BY ma."TstCreation" LIMIT 1`,
          [product.IdeProduct],
        )
      ).rows[0];
      if (!model) {
        const entity = await client.query(`SELECT "IdeEntity" FROM ${S}."SEntity" WHERE lower("CodEntity") = 'sproduct'`);
        let ideEntity = entity.rows[0]?.IdeEntity;
        const active = (await client.query(`SELECT "IdeState" FROM ${S}."SState" WHERE "CodState" = 'ACTIVO' LIMIT 1`)).rows[0].IdeState;
        if (!ideEntity) {
          ideEntity = (
            await client.query(
              `INSERT INTO ${S}."SEntity" ("CodEntity","DesEntity","IdeState","UsrCreation","TstCreation","UsrModification","TstModification")
               VALUES ('SProduct','Producto',$1,'script',now(),'script',now()) RETURNING "IdeEntity"`,
              [active],
            )
          ).rows[0].IdeEntity;
        }
        model = (
          await client.query(
            `INSERT INTO ${S}."SModelAttribute" ("CodModelAttribute","DesModelAttribute","IdeEntityApply","IdeEntityReference","IdeReference","IdeState","UsrCreation","TstCreation","UsrModification","TstModification")
             VALUES ($1,$2,$3,$3,$4,$5,'script',now(),'script',now()) RETURNING "IdeModelAttribute"`,
            [`${product.CodProduct}.CAMPOS`.slice(0, 200), `Campos personalizados ${product.CodProduct}`, ideEntity, product.IdeProduct, active],
          )
        ).rows[0];
        console.log(`\nCreado el modelo de atributos del producto (${product.CodProduct}.CAMPOS).`);
      }
      for (const p of chosen) {
        await client.query(
          `UPDATE ${S}."SAttributeProperty" SET "IdeModelAttribute" = $1, "UsrModification" = 'script', "TstModification" = now()
            WHERE "IdeAttributeProperty" = $2`,
          [model.IdeModelAttribute, p.IdeAttributeProperty],
        );
      }
      await client.query('COMMIT');
      console.log(`\nOK. ${chosen.length} campo(s) movido(s) a nivel producto. Las cotizaciones viejas siguen tarifando (el motor busca tambien en el riesgo).`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
