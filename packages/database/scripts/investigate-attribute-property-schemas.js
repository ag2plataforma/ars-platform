#!/usr/bin/env node
/**
 * Segunda pasada de investigación del motor de atributos, más profunda
 * que `investigate-attribute-engine.js` (que solo mostraba 5 filas de
 * ejemplo por tabla). Acá el objetivo puntual es: ¿qué formas reales
 * toma `SAttributeProperty.AttributeContent` en el esquema legacy
 * `entity`? En particular, necesitamos ver un ejemplo real de un campo
 * tipo "select"/lista desplegable (ya tenemos confirmado un ejemplo de
 * tipo "date" -- ver docs/02-roadmap.md) para saber:
 *   (a) qué valor exacto toma la clave "type" para ese caso, y
 *   (b) de dónde salen las opciones a mostrar: ¿vienen embebidas en el
 *       propio AttributeContent (ej. un array "options"), o hay que
 *       resolverlas por fuera vía SAttribute.IdeFieldDictionary ->
 *       SFieldValue (que es lo que ya usa PrismaAttributeValueResolver
 *       para GUARDAR el valor elegido, pero no confirma qué usa el
 *       FRONTEND legacy para pintar la lista)?
 *
 * No adivina nada: junta TODAS las filas reales de SAttributeProperty
 * del esquema `entity` (no una muestra de 5), las agrupa por el "type"
 * que declara su AttributeContent, y para cada type muestra hasta 3
 * ejemplos completos + la cadena SAttribute -> SFieldDictionary ->
 * SFieldValue asociada (si tiene), para poder comparar de un vistazo.
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/investigate-attribute-property-schemas.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontró DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('\n########## 1. Todas las filas reales de entity."SAttributeProperty" ##########');
  const propsRes = await client.query(`
    SELECT
      ap."IdeAttributeProperty", ap."CodAttributeProperty", ap."DesAttributeProperty",
      ap."AttributeContent",
      a."CodAttribute", a."DesAttribute", a."IdeFieldDictionary",
      fd."CodFieldDictionary", fd."DesFieldDictionary",
      ma."CodModelAttribute", ma."DesModelAttribute", ma."IdeEntityApply", ma."IdeEntityReference", ma."IdeReference"
    FROM entity."SAttributeProperty" ap
    JOIN entity."SAttribute" a ON a."IdeAttribute" = ap."IdeAttribute"
    LEFT JOIN entity."SFieldDictionary" fd ON fd."IdeFieldDictionary" = a."IdeFieldDictionary"
    JOIN entity."SModelAttribute" ma ON ma."IdeModelAttribute" = ap."IdeModelAttribute"
  `);
  console.log(`Total de filas SAttributeProperty (con sus joins): ${propsRes.rows.length}`);

  const byType = new Map();
  const parseErrors = [];
  for (const row of propsRes.rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.AttributeContent);
    } catch (err) {
      parseErrors.push({ CodAttributeProperty: row.CodAttributeProperty, raw: row.AttributeContent, error: err.message });
      continue;
    }
    const type = parsed && typeof parsed === 'object' ? String(parsed.type ?? '(sin "type")') : '(no es objeto)';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push({ row, parsed });
  }

  console.log(`\n########## 2. Agrupado por "type" declarado en AttributeContent ##########`);
  for (const [type, entries] of byType.entries()) {
    console.log(`\n=== type = "${type}" (${entries.length} campo(s)) ===`);
    for (const { row, parsed } of entries.slice(0, 3)) {
      console.log(`\n  -- CodAttributeProperty: ${row.CodAttributeProperty} ("${row.DesAttributeProperty}")`);
      console.log(`     SAttribute: ${row.CodAttribute} ("${row.DesAttribute}")`);
      console.log(`     SFieldDictionary: ${row.CodFieldDictionary ?? '(ninguno)'} ("${row.DesFieldDictionary ?? ''}")`);
      console.log(`     SModelAttribute: ${row.CodModelAttribute} ("${row.DesModelAttribute}") | IdeEntityApply=${row.IdeEntityApply} IdeEntityReference=${row.IdeEntityReference} IdeReference=${row.IdeReference}`);
      console.log(`     AttributeContent parseado:`);
      console.log('     ' + JSON.stringify(parsed, null, 2).split('\n').join('\n     '));

      if (row.CodFieldDictionary) {
        const values = await client.query(
          `SELECT "CodFieldValue", "DesFieldValue" FROM entity."SFieldValue" WHERE "IdeFieldDictionary" = $1 LIMIT 10`,
          [row.IdeFieldDictionary],
        );
        console.log(`     SFieldValue para "${row.CodFieldDictionary}" (hasta 10 de ${values.rowCount}): ${JSON.stringify(values.rows)}`);
      }
    }
    if (entries.length > 3) console.log(`  ... y ${entries.length - 3} más de este mismo type (omitidos)`);
  }

  if (parseErrors.length > 0) {
    console.log(`\n########## 3. AttributeContent que NO parsea como JSON (${parseErrors.length}) ##########`);
    console.log(JSON.stringify(parseErrors, null, 2));
  }

  console.log(`\n########## 4. SEntity referenciadas por SModelAttribute.IdeEntityApply (para saber qué código usar) ##########`);
  const entityIds = [...new Set(propsRes.rows.map((r) => r.IdeEntityApply))];
  if (entityIds.length > 0) {
    const entities = await client.query(
      `SELECT "IdeEntity", "CodEntity", "DesEntity" FROM entity."SEntity" WHERE "IdeEntity" = ANY($1::uuid[])`,
      [entityIds],
    );
    console.log(JSON.stringify(entities.rows, null, 2));
  } else {
    console.log('(sin IdeEntityApply para resolver)');
  }

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
