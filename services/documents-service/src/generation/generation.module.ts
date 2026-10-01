import { Module } from '@nestjs/common';
import { DocumentsStateMachineModule } from '../state-machine/documents-state-machine.module';
import { TemplatesModule } from '../templates/templates.module';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [DocumentsStateMachineModule, TemplatesModule],
  controllers: [GenerationController],
  providers: [GenerationService],
})
export class GenerationModule {}
