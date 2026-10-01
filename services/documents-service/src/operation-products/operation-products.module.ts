import { Module } from '@nestjs/common';
import { OperationProductsController } from './operation-products.controller';
import { OperationProductsService } from './operation-products.service';
import { PersonRolesController } from './person-roles.controller';

@Module({
  controllers: [OperationProductsController, PersonRolesController],
  providers: [OperationProductsService],
})
export class OperationProductsModule {}
