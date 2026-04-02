/**
 * AppModule - 根模块 (Root Module)
 *
 * NestJS 的每个应用都有一个根模块，它是整个应用的入口。
 * 你可以把它理解为"总指挥"，负责把所有子模块组装在一起。
 *
 * The root module is the starting point of the application.
 * It wires together all feature modules and global configuration.
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    /**
     * ConfigModule - 读取 .env 文件中的环境变量
     * isGlobal: true → 让所有子模块都能直接使用，不需要重复导入
     *
     * ConfigModule loads environment variables from .env file.
     * isGlobal: true means any module can inject ConfigService without importing this again.
     */
    ConfigModule.forRoot({ isGlobal: true }),

    /**
     * TypeOrmModule - 连接 PostgreSQL 数据库
     * forRootAsync 允许我们异步读取 ConfigService 中的配置（如数据库密码）
     *
     * TypeOrmModule connects the app to PostgreSQL.
     * forRootAsync lets us read DB credentials from ConfigService at startup.
     *
     * 重要配置项 / Key options:
     * - entities: 自动扫描所有 *.entity.ts 文件作为数据库表
     * - synchronize: true → 开发时自动根据 Entity 创建/更新表结构（生产环境请关闭！）
     */
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_DATABASE', 'events_db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // ⚠️ dev only — disable in production!
      }),
    }),

    // 功能模块 / Feature modules
    EventsModule, // 管理 Event 的增删查 + 合并
    UsersModule,  // 管理 User 实体
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
