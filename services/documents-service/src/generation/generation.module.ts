import { Module } from '@nestjs/common';
import { DocumentsStateMachineModule } from '../state-machine/documents-state-machine.module';
import { TemplatesModule } from '../templates/templates.module';
import { GenerationController, GenerationQuotesController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [DocumentsStateMachineModule, TemplatesModule],
  controllers: [GenerationController, GenerationQuotesController],
  providers: [GenerationService],
})
export class GenerationModule {}
