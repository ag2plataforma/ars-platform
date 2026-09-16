import { Controller, Get } from '@nestjs/common';
import { Public } from '@ars-platform/shared-common';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'underwriting-service',
      timestamp: new Date().toISOString(),
    };
  }
}
