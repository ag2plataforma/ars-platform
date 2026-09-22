import { Module } from '@nestjs/common';
import { ReferenceDataStateMachineModule } from '../state-machine/reference-data-state-machine.module';
import { LanguagesController } from './languages.controller';
import { LanguagesService } from './languages.service';
import { GendersController } from './genders.controller';
import { GendersService } from './genders.service';
import { MaritalStatusesController } from './marital-statuses.controller';
import { MaritalStatusesService } from './marital-statuses.service';
import { ProfessionsController } from './professions.controller';
import { ProfessionsService } from './professions.service';
import { BusinessActivitiesController } from './business-activities.controller';
import { BusinessActivitiesService } from './business-activities.service';
import { IdentificationTypesController } from './identification-types.controller';
import { IdentificationTypesService } from './identification-types.service';
import { RelationshipsController } from './relationships.controller';
import { RelationshipsService } from './relationships.service';
import { ContactClassesController } from './contact-classes.controller';
import { ContactClassesService } from './contact-classes.service';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { ConceptTypesController } from './concept-types.controller';
import { ConceptTypesService } from './concept-types.service';
import { ConceptsController } from './concepts.controller';
import { ConceptsService } from './concepts.service';

/**
 * Catálogos comunes que menciona el alcance original del README de este
 * servicio (país, idioma, género, profesión, ...) y que hasta ahora no
 * tenían dueño en ningún servicio (a diferencia de moneda/`SCurrency`,
 * que ya se resolvió en `product-rating-service`). Ninguno tiene función
 * PL/pgSQL propia de escritura -- son catálogos administrativos puros,
 * mismo patrón `CatalogCrudService` que los 8 catálogos "simples" de
 * `product-rating-service` para los que no tienen FK propia
 * (`SLanguage`/`SGender`/`SMaritalStatus`/`SProfession`/
 * `SBusinessActivity`/`SIdentificationType`/`SRelationship`/
 * `SContactClass`), extendido con resolución de FK por código para
 * `SCountry` (resuelve `codLanguage`). `SLocation` es la excepción: se
 * escribe a mano porque su unicidad real es compuesta
 * (`CodLocation`+`IdeCountry`, no un código único global) y tiene
 * jerarquía propia -- ver el comentario de cabecera de
 * `locations.service.ts`. `SConceptType`/`SConcept` son la excepción
 * más nueva: sin CRUD en ningún servicio hasta esta fase, prerequisito
 * real de `SCalculationRule.CodConcept` (ver `concepts.service.ts`).
 */
@Module({
  imports: [ReferenceDataStateMachineModule],
  controllers: [
    LanguagesController,
    GendersController,
    MaritalStatusesController,
    ProfessionsController,
    BusinessActivitiesController,
    IdentificationTypesController,
    RelationshipsController,
    ContactClassesController,
    CountriesController,
    LocationsController,
    ConceptTypesController,
    ConceptsController,
  ],
  providers: [
    LanguagesService,
    GendersService,
    MaritalStatusesService,
    ProfessionsService,
    BusinessActivitiesService,
    IdentificationTypesService,
    RelationshipsService,
    ContactClassesService,
    CountriesService,
    LocationsService,
    ConceptTypesService,
    ConceptsService,
  ],
})
export class CommonCatalogsModule {}
