import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global para que cualquier servicio lo importe una sola vez en su
 * AppModule y tenga PrismaService disponible en todos sus módulos
 * sin reimportarlo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
