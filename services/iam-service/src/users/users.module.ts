import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { IamStateMachineModule } from '../state-machine/iam-state-machine.module';

@Module({
  imports: [IamStateMachineModule], // para StateMachineService (ver UsersService.setState)
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
