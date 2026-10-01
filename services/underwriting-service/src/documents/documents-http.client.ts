import { Injectable, Logger } from '@nestjs/common';

/**
 * Llamada HTTP real a `documents-service` -- mismo patrón ya establecido
 * con `SocialImpactHttpClient` (ver ese archivo): `fetch` nativo,
 * reenvía el mismo `Authorization` del usuario que activó el contrato,
 * sin credencial service-to-service aparte (`documents-service` valida
 * ese JWT con el mismo `AuthModule`/`JWT_SECRET` que todos los demás
 * servicios).
 *
 * A diferencia de `SocialImpactHttpClient` (que SÍ propaga el error al
 * usuario si `social-impact-service` falla), acá el criterio es el
 * opuesto a propósito: el correo de bienvenida es un extra sobre
 * "Activar contrato", no un requisito -- si `documents-service` no
 * responde, no hay plantilla configurada todavía para este producto, o
 * Brevo falla, NUNCA debe tirar abajo la activación del contrato (que ya
 * se guardó en la base de datos cuando se llega a este punto). Por eso
 * este cliente no lanza: solo loguea y devuelve `false`.
 */
@Injectable()
export class DocumentsHttpClient {
  private readonly logger = new Logger(DocumentsHttpClient.name);
  private readonly baseUrl = (process.env.DOCUMENTS_SERVICE_URL ?? 'http://localhost:3009').replace(/\/$/, '');

  async sendWelcomeEmail(ideContract: string, authorization: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/generation/contracts/${ideContract}/welcome-email`, {
        method: 'POST',
        headers: { Authorization: authorization },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(`documents-service respondió ${response.status} al enviar el correo de bienvenida: ${body}`);
        return false;
      }
      const result = (await response.json()) as { sent: boolean; reason?: string };
      if (!result.sent) {
        this.logger.warn(`Correo de bienvenida no enviado para el contrato "${ideContract}": ${result.reason}`);
      }
      return result.sent;
    } catch (err) {
      this.logger.error(
        `No se pudo contactar documents-service en ${this.baseUrl} para el correo de bienvenida: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
