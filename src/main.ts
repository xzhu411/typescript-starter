/**
 * main.ts - 应用启动入口 (Application Bootstrap)
 *
 * 这是整个 NestJS 应用最先执行的文件，类似于 Java 的 main() 函数。
 * 它负责：创建应用实例、挂载全局配置、启动 HTTP 服务器。
 *
 * This is the entry point of the NestJS application.
 * It creates the app, sets up global middleware, configures Swagger, and starts the server.
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // 创建 NestJS 应用实例 / Create the NestJS application instance
  const app = await NestFactory.create(AppModule);

  /**
   * 全局参数验证管道 (Global Validation Pipe)
   *
   * 所有进来的 HTTP 请求 body 都会自动根据 DTO 类的装饰器进行验证。
   * whitelist: true → 自动过滤掉 DTO 中没有定义的多余字段，防止恶意注入。
   *
   * Automatically validates all incoming request bodies using DTO decorators.
   * whitelist: true strips any extra fields not defined in the DTO.
   */
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  /**
   * Swagger UI 配置 (API Documentation)
   *
   * Swagger 会自动扫描所有 Controller 和 DTO，生成一个可交互的 API 文档页面。
   * 访问地址 / Access at: http://localhost:3000/api
   *
   * Swagger auto-generates interactive API docs from your controllers and DTOs.
   */
  const config = new DocumentBuilder()
    .setTitle('Events Management API')
    .setDescription('REST API for managing events and users')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // 挂载到 /api 路径

  // 启动 HTTP 服务器，监听 3000 端口 / Start listening on port 3000
  await app.listen(3000);
}

bootstrap();
