import { Module } from '@nestjs/common';
import { DocumentsHttpClient } from './documents-http.client';

/**
 * Wrapper mínimo para inyectar `DocumentsHttpClient` -- ver el
 * doc-comment de ese archivo para el detalle completo (correo de
 * bienvenida con la póliza adjunta, disparado desde
 * `ContractsService.activate`).
 */
@Module({
  providers: [DocumentsHttpClient],
  exports: [DocumentsHttpClient],
})
export class DocumentsModule {}
