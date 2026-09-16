import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma como servicio inyectable de Nest, con ciclo de vida
 * conectado al del módulo. Generado por introspección del esquema
 * `ars_platform` (ver prisma/schema.prisma) — 130 modelos, uno por
 * tabla existente.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
