import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Estampa las columnas de auditoría (UsrCreation/TstCreation/UsrModification/
 * TstModification) presentes en prácticamente todas las tablas del esquema
 * actual. Requiere que un guard de autenticación ya haya puesto
 * `request.user = { username: string, ... }` antes de llegar aquí.
 *
 * Uso: @UseInterceptors(AuditInterceptor) a nivel de controller o método,
 * o global vía APP_INTERCEPTOR en el AppModule del servicio.
 *
 * A diferencia del interceptor original (ins-ars-shared-common, nunca
 * reutilizado de forma consistente entre servicios), este vive en
 * shared-common para que todos los servicios lo importen del mismo sitio.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method: string = request.method;
    const username: string = request.user?.username ?? 'system';
    const now = new Date();

    if (method === 'POST' && request.body && typeof request.body === 'object') {
      request.body.UsrCreation = username;
      request.body.TstCreation = now;
      request.body.UsrModification = username;
      request.body.TstModification = now;
    }

    if ((method === 'PATCH' || method === 'PUT') && request.body && typeof request.body === 'object') {
      request.body.UsrModification = username;
      request.body.TstModification = now;
    }

    return next.handle();
  }
}
