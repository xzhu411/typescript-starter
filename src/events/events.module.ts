/**
 * EventsModule - 事件功能模块 (Events Feature Module)
 *
 * NestJS 用 Module 来组织相关功能。每个 Module 是一个独立的功能单元，
 * 包含自己的 Controller、Service 和需要的数据库实体。
 *
 * NestJS uses Modules to organize related features.
 * Each module encapsulates its own controller, service, and database repositories.
 *
 * @Module 装饰器的三个关键属性：
 * - imports:     这个模块需要用到的其他模块（如数据库仓库）
 * - controllers: 处理 HTTP 请求的控制器
 * - providers:   服务类（Service），由 NestJS 的 IoC 容器管理和注入
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { User } from '../users/user.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    /**
     * TypeOrmModule.forFeature([Event, User])
     * 向这个模块注册 Event 和 User 的 Repository（数据库操作对象）。
     * 注册后，EventsService 就可以通过 @InjectRepository(Event) 注入并使用它。
     *
     * Registers the Repository for Event and User in this module's scope.
     * After this, EventsService can inject Repository<Event> and Repository<User>.
     */
    TypeOrmModule.forFeature([Event, User]),
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
