import { Module } from '@nestjs/common';
import { ReferenceDataStateMachineModule } from '../state-machine/reference-data-state-machine.module';
import { FieldDictionaryController } from './field-dictionary.controller';
import { FieldDictionaryService } from './field-dictionary.service';
import { FieldValuesController } from './field-values.controller';
import { FieldValuesService } from './field-values.service';

/**
 * `SFieldDictionary`/`SFieldValue` -- el diccionario de campos y sus
 * valores posibles (ver el comentario en `field-dictionary.service.ts`
 * para el alcance exacto y lo que queda deliberadamente afuera).
 */
@Module({
  imports: [ReferenceDataStateMachineModule],
  controllers: [FieldDictionaryController, FieldValuesController],
  providers: [FieldDictionaryService, FieldValuesService],
})
export class FieldCatalogModule {}
