import { Module } from '@nestjs/common';
import { StateMachineModule, STATE_RULE_REPOSITORY } from '@ars-platform/shared-common';
import { PrismaStateRuleRepository } from '@ars-platform/database';

const stateMachine = StateMachineModule.forRoot({
  provide: STATE_RULE_REPOSITORY,
  useClass: PrismaStateRuleRepository,
});

@Module({ imports: [stateMachine], exports: [stateMachine] })
export class SocialImpactStateMachineModule {}
