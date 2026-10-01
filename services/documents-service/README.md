# documents-service

Gestión de plantillas de documentos físicos (.docx) y generación de PDF (contratos, recibos, cotizaciones, comunicados) -- ver `docs/02-roadmap.md`, item 5.

Servicio **nuevo** (2026-10-01), no reemplaza a ningún servicio de v1 directamente -- decisión explícita del usuario tras evaluar reusar `ag2-printer-api` (v1, Python/Flask, no desplegado hoy): construir uno propio del monorepo, mismo patrón de scaffold que el resto (`iam-service`/`product-rating-service`), en vez de desplegar/mantener un segundo stack aparte.

## Cómo genera el PDF

1. `TemplatesService` resuelve la plantilla `.docx` activa para un producto+operación+tipo de documento+rol de persona (`SOperationProductTemplate`, tabla legada que nunca tuvo pantalla propia en v1).
2. `renderDocxTemplate` (`src/rendering/render-template.ts`) la rellena con variables (`{{campo}}`) usando `docxtemplater` (licencia MIT, uso comercial libre -- confirmado antes de elegirlo).
3. `convertDocxToPdf` (`src/rendering/docx-to-pdf.ts`) la convierte a PDF invocando LibreOffice headless (`soffice --headless --convert-to pdf`) -- mismo mecanismo que `ag2-printer-api` (v1, Python) usaba, ahora en Node/TypeScript.
4. El PDF se guarda como `bytea` directo en Postgres (`TContractOperationDocument.PdfData`) -- sin Cloudinary ni otro storage externo, mismo criterio de minimizar infraestructura ya usado en el proyecto (ver ADR `docs/00-arquitectura.md`).

**Requiere LibreOffice instalado** donde corra este servicio -- en producción viene en la imagen Docker; en desarrollo local hace falta instalarlo aparte (https://www.libreoffice.org/download/download/).

## Endpoints

- `GET /health` — salud del servicio (`@Public()`).
- `GET /operation-products?ideProduct=<uuid>` — operaciones (`SOperationProduct`) ya configuradas para un producto.
- `GET /person-roles` — catálogo de roles de persona (`SPersonRol`).
- `GET /templates?ideOperationProduct=<uuid>` — plantillas cargadas para esa combinación.
- `POST /templates` — crea una plantilla nueva (archivo `.docx` en base64 dentro del JSON, no multipart -- ver doc-comment de `main.ts`: así pasa sin cambios por el proxy del gateway, que hoy solo reenvía bodies JSON).
- `PATCH /templates/:id/file` — reemplaza el archivo de una plantilla existente.
- `POST /generation/contracts/:ideContract` — genera el documento de un contrato (`{ codTemplateType, idePersonRol }`).
- `GET /generation/contracts/:ideContract` — lista los documentos ya generados para ese contrato.
- `GET /generation/contracts/documents/:id/download` — descarga el PDF generado.

## Primer tipo de documento implementado

"Póliza/Contrato emitido" (`codTemplateType='CONTRATO'`) -- decisión explícita del usuario. Recibo/Cotización/Comunicado quedan listados en el tipo pero sin generador propio todavía (ver `GenerationService`, doc-comment de clase).

## Pendiente, fuera de alcance de esta primera versión

- Activar/desactivar una plantilla (`IdeState`): no se implementó -- no hay un uso previo de `SOperationProductTemplate` en el código que confirme qué código de `SState` corresponde a "Inactivo" acá, y otras partes del proyecto usan casings distintos (`'Activo'` vs `'ACTIVO'`). Reemplazar el archivo de una plantilla (`PATCH /templates/:id/file`) sí está disponible mientras tanto.
