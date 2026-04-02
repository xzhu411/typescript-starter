/**
 * EventsController - 路由控制器 (Route Controller)
 *
 * Controller 的职责：接收 HTTP 请求 → 调用 Service → 返回响应。
 * 它本身不包含业务逻辑，只负责"路由分发"和"参数提取"。
 *
 * 可以理解为餐厅的"服务员"：
 *   客户（HTTP 请求）→ 服务员（Controller）→ 厨师（Service）→ 端菜返回
 *
 * Controller's job: receive HTTP requests, delegate to Service, return response.
 * Think of it as a waiter: takes order → passes to kitchen → returns the food.
 *
 * @Controller('events') → 所有路由都以 /events 为前缀
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';

@ApiTags('Events') // Swagger 中的分组标签
@Controller('events')
@UsePipes(new ValidationPipe({ whitelist: true })) // 对所有路由启用参数验证
export class EventsController {
  /**
   * 依赖注入 (Dependency Injection)
   * NestJS 自动创建 EventsService 实例并注入到这里，不需要手动 new。
   * Constructor injection: NestJS auto-creates and injects EventsService.
   */
  constructor(private readonly eventsService: EventsService) {}

  /**
   * POST /events
   * 创建新事件
   *
   * @Body() dto → NestJS 自动将请求 body 解析并验证为 CreateEventDto 对象
   */
  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  @ApiCreatedResponse({ description: 'Event created successfully' })
  create(@Body() dto: CreateEventDto) {
    return this.eventsService.create(dto);
  }

  /**
   * GET /events/:id
   * 根据 ID 查询事件
   *
   * @Param('id', ParseIntPipe) → 从 URL 中取出 :id 参数，并用 ParseIntPipe 转为数字
   * 如果 id 不是数字（如 /events/abc），ParseIntPipe 会自动返回 400 Bad Request
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get an event by ID' })
  @ApiOkResponse({ description: 'Event found' })
  @ApiNotFoundResponse({ description: 'Event not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.findOne(id);
  }

  /**
   * DELETE /events/:id
   * 删除事件
   *
   * @HttpCode(204) → 删除成功后返回 204 No Content（业界标准，不返回 body）
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an event by ID' })
  @ApiNoContentResponse({ description: 'Event deleted' })
  @ApiNotFoundResponse({ description: 'Event not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.remove(id);
  }

  /**
   * POST /events/merge-all/:userId
   * 合并指定用户的所有时间重叠事件
   *
   * 注意：这个路由必须放在 GET :id 之前定义，否则 NestJS 会把 "merge-all"
   * 当成 :id 参数来处理！（路由匹配是按定义顺序进行的）
   *
   * Note: This route MUST be defined before GET :id,
   * otherwise "merge-all" would be matched as the :id param.
   */
  @Post('merge-all/:userId')
  @ApiOperation({
    summary: 'Merge all overlapping events for a user',
    description:
      'Finds overlapping events, merges them (title/description appended, highest status kept, invitees unioned), deletes originals, and updates the user.',
  })
  @ApiCreatedResponse({ description: 'List of resulting events after merge' })
  @ApiNotFoundResponse({ description: 'User not found' })
  mergeAll(@Param('userId', ParseIntPipe) userId: number) {
    return this.eventsService.mergeAll(userId);
  }
}
