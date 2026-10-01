import { Module } from '@nestjs/common';
import { DocumentsStateMachineModule } from '../state-machine/documents-state-machine.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [DocumentsStateMachineModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
