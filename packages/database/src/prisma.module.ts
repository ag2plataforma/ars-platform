import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TaskQueueRepository } from './repositories/task-queue.repository';
import { AiTraceRepository } from './repositories/ai-trace.repository';

/**
 * Global para que cualquier servicio lo importe una sola vez en su
 * AppModule y tenga PrismaService disponible en todos sus módulos
 * sin reimportarlo. `TaskQueueRepository` (cola de tareas en segundo plano)
 * viaja con él: cualquier servicio puede encolar sin importar nada más.
 * Lo mismo `AiTraceRepository` (trazabilidad de las llamadas a la IA).
 */
@Global()
@Module({
  providers: [PrismaService, TaskQueueRepository, AiTraceRepository],
  exports: [PrismaService, TaskQueueRepository, AiTraceRepository],
})
export class PrismaModule {}
