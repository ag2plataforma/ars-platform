import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeSmsRecipient } from './sms-recipient';
import { SmsMessage, SmsSender } from './sms-sender.interface';

/**
 * "Proveedor" de desarrollo (`SMS_PROVIDER=log`): no envía nada, valida el
 * número igual que los reales y escribe el SMS en el log del servicio. Sirve
 * para probar el flujo completo (cola, tareas, texto del mensaje) sin
 * créditos ni cuenta en un proveedor.
 */
@Injectable()
export class LogSmsSender implements SmsSender {
  private readonly logger = new Logger(LogSmsSender.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: SmsMessage): Promise<void> {
    const to = normalizeSmsRecipient(message.to, this.config.get<string>('SMS_DEFAULT_COUNTRY_CODE'));
    this.logger.log(`[SMS simulado] a +${to}: ${message.content}`);
  }
}
