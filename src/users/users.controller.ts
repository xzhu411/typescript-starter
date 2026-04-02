/**
 * UsersController - 用户路由
 *
 * 提供创建用户 和 查看所有用户 两个接口。
 * 这样在测试 invitees 功能时，可以先通过 POST /users 创建用户，
 * 再把 userId 传给 POST /events 的 inviteeIds 字段。
 *
 * Provides endpoints to create users and list them.
 * You need users to exist before you can add them as event invitees.
 */
import {
  Body,
  Controller,
  Get,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('Users')
@Controller('users')
@UsePipes(new ValidationPipe({ whitelist: true }))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /users
   * 创建一个用户，返回带 id 的用户对象。
   * 创建完后，把这个 id 传给 POST /events 的 inviteeIds 字段。
   */
  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiCreatedResponse({ description: 'User created. Use the returned id as inviteeIds in POST /events.' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  /**
   * GET /users
   * 查看所有用户和他们参加的事件列表。
   */
  @Get()
  @ApiOperation({ summary: 'List all users with their events' })
  @ApiOkResponse({ description: 'List of all users' })
  findAll() {
    return this.usersService.findAll();
  }
}
