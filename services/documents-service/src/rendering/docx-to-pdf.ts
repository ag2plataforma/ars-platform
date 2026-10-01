import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';

const execFileAsync = promisify(execFile);

/**
 * Convierte un .docx (ya mergeado por `renderDocxTemplate`) a PDF
 * invocando LibreOffice headless -- mismo mecanismo que `ag2-printer-api`
 * (v1, Python) usaba vía `os.system(...)`, acá con `execFile` (sin pasar
 * por una shell, evita problemas de escaping de paths con espacios) y
 * con timeout explícito para no colgar el proceso si LibreOffice se
 * queda trabado.
 *
 * Requiere LibreOffice instalado donde corra este servicio -- en
 * producción (Docker, ver Dockerfile) viene instalado en la imagen; en
 * desarrollo local (Mac) hace falta tenerlo instalado aparte
 * (https://www.libreoffice.org/download/download/) para poder probar
 * la generación de documentos sin levantar el contenedor.
 */
function resolveSofficeCommand(): string {
  if (process.env.SOFFICE_PATH) return process.env.SOFFICE_PATH;
  if (process.platform === 'darwin') return '/Applications/LibreOffice.app/Contents/MacOS/soffice';
  return 'soffice';
}

export async function convertDocxToPdf(docxBytes: Buffer): Promise<Buffer> {
  const tmpDir = process.env.DOCUMENTS_TMP_DIR || os.tmpdir();
  const workDir = path.join(tmpDir, `doc-${randomUUID()}`);
  await fs.mkdir(workDir, { recursive: true });
  const docxPath = path.join(workDir, 'input.docx');
  const pdfPath = path.join(workDir, 'input.pdf');

  try {
    await fs.writeFile(docxPath, docxBytes);

    await execFileAsync(
      resolveSofficeCommand(),
      ['--headless', '--convert-to', 'pdf', '--outdir', workDir, docxPath],
      { timeout: 60_000 },
    );

    return await fs.readFile(pdfPath);
  } catch (err) {
    throw new InternalServerErrorException(
      `No se pudo convertir el documento a PDF (¿está LibreOffice instalado y disponible como "soffice"?): ${(err as Error).message}`,
    );
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
