import { Controller, Get, Param, Query } from '@nestjs/common';
import { ContractBillingService } from './contract-billing.service';
import { ListContractBillingDto } from './dto/list-contract-billing.dto';

@Controller('contract-billing')
export class ContractBillingController {
  constructor(private readonly service: ContractBillingService) {}

  @Get()
  findAll(@Query() query: ListContractBillingDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
