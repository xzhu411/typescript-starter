/**
 * CreateEventDto - 数据传输对象 (Data Transfer Object)
 *
 * DTO 的作用：定义 HTTP 请求 body 的"形状"，并对每个字段进行验证。
 * 当客户端发送 POST /events 请求时，NestJS 会用这个类来：
 *   1. 验证每个字段是否合法（类型、是否必填等）
 *   2. 过滤掉 DTO 中没有定义的多余字段（whitelist 模式）
 *   3. 在 Swagger 文档中自动生成请求体的示例和说明
 *
 * DTO defines the shape and validation rules for the incoming request body.
 * class-validator decorators enforce rules; @nestjs/swagger decorators add API docs.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { EventStatus } from '../event.entity';

export class CreateEventDto {
  /**
   * @ApiProperty → Swagger 文档中显示此字段（必填）
   * @IsString    → 验证必须是字符串
   * @IsNotEmpty  → 验证不能是空字符串
   */
  @ApiProperty({ example: 'Sprint Planning' })
  @IsString()
  @IsNotEmpty()
  title: string;

  /**
   * @ApiPropertyOptional → Swagger 文档中标记为可选字段
   * @IsOptional          → 允许请求中不传这个字段
   */
  @ApiPropertyOptional({ example: 'Q1 planning session' })
  @IsString()
  @IsOptional()
  description?: string;

  /**
   * @IsEnum → 验证值必须是 EventStatus 枚举中的一个
   * 如果传入 "INVALID"，会直接返回 400 Bad Request
   */
  @ApiProperty({ enum: EventStatus, example: EventStatus.TODO })
  @IsEnum(EventStatus)
  status: EventStatus;

  /**
   * @IsDateString → 验证必须是合法的 ISO 8601 时间格式
   * 例如："2024-03-01T14:00:00Z" ✅  "not-a-date" ❌
   */
  @ApiProperty({ example: '2024-03-01T14:00:00Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2024-03-01T15:00:00Z' })
  @IsDateString()
  endTime: string;

  /** 受邀用户的 ID 列表，可选 / Optional list of user IDs to invite */
  @ApiPropertyOptional({ type: [Number], example: [1, 2] })
  @IsArray()
  @IsOptional()
  inviteeIds?: number[];
}
