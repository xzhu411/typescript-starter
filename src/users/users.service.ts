import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    // events 初始化为空数组
    const user = this.userRepo.create({ name: dto.name, events: [] });
    return this.userRepo.save(user);
  }

  async findAll(): Promise<User[]> {
    // User.events 是 string[]，不需要 relations，直接返回即可
    return this.userRepo.find();
  }
}
