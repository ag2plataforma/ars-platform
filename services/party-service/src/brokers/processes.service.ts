import { Injectable } from '@nestjs/common';
import { PrismaService, SProcess } from '@ars-platform/database';

/**
 * `SProcess` -- catálogo de procesos operativos (ej. "Contratación de
 * Póliza", usado por `RECEGENE`), del mismo tipo que `SDistributionChannel`
 * antes de tener CRUD propio: no tiene función PL/pgSQL de escritura,
 * pero tampoco se le pidió gestión completa todavía -- se asume ya
 * sembrado (mismo criterio que `SBrokerType`, ver `brokers.service.ts`).
 *
 * Solo lectura, agregado puntualmente para poder mostrar un desplegable
 * real en la pestaña "Comisiones" de la nueva pantalla de Comisiones del
 * backoffice (`codProcess` en `SCommission`) en vez de pedirle al
 * usuario que escriba el código de memoria -- sin esto, el único
 * catálogo de las 4 pestañas sin ningún origen de datos habría sido un
 * campo de texto libre propenso a error de tipeo.
 */
@Injectable()
export class ProcessesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<SProcess[]> {
    return this.prisma.sProcess.findMany({
      include: { SState: true },
      orderBy: { DesProcess: 'asc' },
    });
  }
}
