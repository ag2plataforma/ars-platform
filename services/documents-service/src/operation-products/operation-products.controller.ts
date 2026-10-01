import { Controller, Get, Query } from '@nestjs/common';
import { OperationProductsService } from './operation-products.service';

@Controller('operation-products')
export class OperationProductsController {
  constructor(private readonly service: OperationProductsService) {}

  @Get()
  findByProduct(@Query('ideProduct') ideProduct: string) {
    return this.service.findByProduct(ideProduct);
  }
}
