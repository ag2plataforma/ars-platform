import { Module } from '@nestjs/common';
import { ReferenceDataStateMachineModule } from '../state-machine/reference-data-state-machine.module';
import { TextContentController } from './text-content.controller';
import { TextContentService } from './text-content.service';
import { TranslationsController } from './translations.controller';
import { TranslationsService } from './translations.service';

/**
 * i18n (`STextContent`/`STranslator`) -- confirmado que NO hay ninguna
 * función PL/pgSQL real que resolver acá: se investigó `FGetSiteMap`
 * (único candidato con "Translat"/"GetText" en el nombre además de
 * `pg_catalog.translate`, la función nativa de Postgres, irrelevante) y
 * no usa estas tablas para nada -- el título del site map sale literal
 * de `SSiteMap.DesSiteMap`, sin traducir. Es CRUD administrativo puro:
 * `STextContent` es el "grupo de traducción" que ~60 tablas del esquema
 * referencian vía su propio `IdeTextContent` opcional; `STranslator` es
 * cada traducción puntual a un idioma dentro de ese grupo.
 */
@Module({
  imports: [ReferenceDataStateMachineModule],
  controllers: [TextContentController, TranslationsController],
  providers: [TextContentService, TranslationsService],
})
export class I18nModule {}
