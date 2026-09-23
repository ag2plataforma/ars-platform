import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { PersonsService } from './persons.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { LookupPersonDto } from './dto/lookup-person.dto';
import { SearchPersonsDto } from './dto/search-persons.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreateContactDataDto } from './dto/create-contact-data.dto';
import { UpdateContactDataDto } from './dto/update-contact-data.dto';

/**
 * `TPerson`/`TAddress`/`TContactData` -- operación de usuario
 * autenticado normal (sin `@Roles`), igual que `QuotesController` en
 * underwriting-service: cualquier flujo de cotización necesita poder
 * crear/consultar personas, no es administración de catálogo.
 */
@Controller('persons')
export class PersonsController {
  constructor(private readonly service: PersonsService) {}

  @Post()
  create(@Body() dto: CreatePersonDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.code);
  }

  // Antes de ':id' a propósito -- si no, Nest la matchea como :id="lookup".
  @Get('lookup')
  lookup(@Query() query: LookupPersonDto) {
    return this.service.lookup(query);
  }

  // Mismo motivo que 'lookup': antes de ':id' a propósito.
  @Get('search')
  search(@Query() query: SearchPersonsDto) {
    return this.service.search(query.q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto, @CurrentUser() actor: JwtPayload) {
    return this.service.update(id, dto, actor.code);
  }

  @Post(':id/addresses')
  addAddress(@Param('id') id: string, @Body() dto: CreateAddressDto, @CurrentUser() actor: JwtPayload) {
    return this.service.addAddress(id, dto, actor.code);
  }

  @Patch(':id/addresses/:addressId')
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.updateAddress(id, addressId, dto, actor.code);
  }

  @Post(':id/contact-data')
  addContactData(@Param('id') id: string, @Body() dto: CreateContactDataDto, @CurrentUser() actor: JwtPayload) {
    return this.service.addContactData(id, dto, actor.code);
  }

  @Patch(':id/contact-data/:contactDataId')
  updateContactData(
    @Param('id') id: string,
    @Param('contactDataId') contactDataId: string,
    @Body() dto: UpdateContactDataDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.updateContactData(id, contactDataId, dto, actor.code);
  }
}
