import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response as ExpressResponse } from 'express';
import { PROXY_TARGETS, ProxyServiceKey } from './proxy.config';

// Headers "hop-by-hop" / calculados por el transporte -- no tiene sentido
// reenviarlos tal cual, cada salto (cliente->gateway, gateway->servicio)
// recalcula los suyos.
const REQUEST_HEADERS_TO_DROP = new Set(['host', 'connection', 'content-length']);
const RESPONSE_HEADERS_TO_DROP = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]);

/**
 * Reenvía una request entrante al servicio de negocio real
 * correspondiente (`PROXY_TARGETS`), preservando método/query/body/
 * headers -- incluido `Authorization`, para que el guard JWT global de
 * cada servicio (el mismo `AuthModule` de `@ars-platform/shared-common`
 * que ya usan todos) lo valide exactamente igual que si el frontend le
 * hubiera pegado directo.
 *
 * Proxy fiel 1:1, sin agregación: a propósito no arma respuestas
 * compuestas de varios servicios (ver README y docs/02-roadmap.md) --
 * eso se decide cuando haya una pantalla real que lo necesite, no antes.
 *
 * Usa el `fetch` global de Node 20 (disponible desde Node 18, sin
 * dependencia nueva) en vez de axios/@nestjs-axios. Reenvía JSON, que es
 * lo único que exponen los servicios reales hoy -- ninguno acepta upload
 * de archivos todavía, así que ese caso queda deliberadamente sin cubrir.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(private readonly config: ConfigService) {}

  async forward(serviceKey: ProxyServiceKey, req: Request, res: ExpressResponse): Promise<void> {
    const target = PROXY_TARGETS[serviceKey];
    const baseUrl = (this.config.get<string>(target.envVar) ?? target.defaultUrl).replace(/\/$/, '');
    const prefix = `/${serviceKey}`;
    const downstreamPath = req.path.startsWith(prefix) ? req.path.slice(prefix.length) || '/' : req.path;
    const query = this.buildQueryString(req.query as Record<string, unknown>);
    const url = `${baseUrl}${downstreamPath}${query ? `?${query}` : ''}`;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string' && !REQUEST_HEADERS_TO_DROP.has(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    const hasBody =
      !['GET', 'HEAD'].includes(req.method) &&
      req.body &&
      typeof req.body === 'object' &&
      Object.keys(req.body).length > 0;
    if (hasBody) {
      headers['content-type'] = 'application/json';
    }

    let upstream: Awaited<ReturnType<typeof fetch>>;
    try {
      upstream = await fetch(url, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
      });
    } catch (err) {
      this.logger.error(`No se pudo contactar "${serviceKey}" en ${url}: ${(err as Error).message}`);
      throw new HttpException(
        { statusCode: 503, message: `El servicio "${serviceKey}" no está disponible en este momento` },
        503,
      );
    }

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!RESPONSE_HEADERS_TO_DROP.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  }

  private buildQueryString(query: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, String(v));
      } else if (value !== undefined) {
        params.append(key, String(value));
      }
    }
    return params.toString();
  }
}
