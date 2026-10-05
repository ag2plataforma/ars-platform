import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AiProvider } from './ai-provider.interface';
import { AnthropicAiProvider } from './anthropic-ai-provider';
import { DisabledAiProvider } from './disabled-ai-provider';
import { MockAiProvider } from './mock-ai-provider';

const DEFAULT_MODEL = 'claude-sonnet-5-5';

/**
 * Elige el proveedor de IA:
 *  - `AI_ENABLED=false` apaga la IA por completo (interruptor general).
 *  - `AI_PROVIDER` = `anthropic` | `mock`; si no está definida, `anthropic`
 *    cuando hay `ANTHROPIC_API_KEY` y desactivada en caso contrario.
 *  - `ANTHROPIC_MODEL` (por defecto `claude-sonnet-5-5`) y `AI_MAX_FILE_MB` (10).
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiProvider => {
        const logger = new Logger('AiModule');
        const enabled = (config.get<string>('AI_ENABLED') ?? 'true').trim().toLowerCase() !== 'false';
        if (!enabled) {
          logger.log('IA desactivada (AI_ENABLED=false)');
          return new DisabledAiProvider('está desactivada por configuración (AI_ENABLED=false)');
        }
        const apiKey = config.get<string>('ANTHROPIC_API_KEY')?.trim();
        const explicit = (config.get<string>('AI_PROVIDER') ?? '').trim().toLowerCase();
        const provider = explicit || (apiKey ? 'anthropic' : 'none');

        if (provider === 'mock') {
          logger.warn('Proveedor de IA: mock (datos simulados)');
          return new MockAiProvider();
        }
        if (provider === 'anthropic') {
          if (!apiKey) return new DisabledAiProvider('falta ANTHROPIC_API_KEY en el .env');
          const model = config.get<string>('ANTHROPIC_MODEL')?.trim() || DEFAULT_MODEL;
          const maxMb = Number(config.get<string>('AI_MAX_FILE_MB')) || 10;
          logger.log(`Proveedor de IA: anthropic (${model})`);
          return new AnthropicAiProvider(apiKey, model, maxMb * 1024 * 1024);
        }
        return new DisabledAiProvider(
          explicit ? `AI_PROVIDER="${explicit}" no es válido (usar "anthropic" o "mock")` : 'no hay AI_PROVIDER ni ANTHROPIC_API_KEY configurados',
        );
      },
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
