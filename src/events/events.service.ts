/**
 * EventsService - 业务逻辑层
 *
 * 数据模型说明 / Data model note:
 *
 *   Event.invitees → ManyToMany → User   （TypeORM 关联，有中间表）
 *   User.events    → string[]            （存 Event ID 字符串，如 ["1","3"]）
 *
 * 两者各自独立维护，需要在 create / mergeAll 时同步更新：
 *   - 创建 Event 时：把新 Event ID 追加到每个 invitee 的 user.events 里
 *   - mergeAll 时：删旧 ID、写入新合并 Event ID
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Event, EventStatus } from './event.entity';
import { User } from '../users/user.entity';
import { CreateEventDto } from './dto/create-event.dto';

const STATUS_PRIORITY: Record<EventStatus, number> = {
  [EventStatus.TODO]: 0,
  [EventStatus.IN_PROGRESS]: 1,
  [EventStatus.COMPLETED]: 2,
};

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 创建新事件
   *
   * 1. 根据 inviteeIds 查出 User 实体，设置 Event.invitees（ManyToMany）
   * 2. 保存 Event
   * 3. 把新 Event 的 id（字符串）追加到每个 invitee 的 user.events 数组里
   */
  async create(dto: CreateEventDto): Promise<Event> {
    // 1. 解析 invitees
    const invitees: User[] = [];
    if (dto.inviteeIds?.length) {
      for (const id of dto.inviteeIds) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (user) invitees.push(user);
      }
    }

    // 2. 创建并保存 Event（含 invitees 关联）
    const event = this.eventRepo.create({
      title: dto.title,
      description: dto.description,
      status: dto.status,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      invitees,
    });
    const saved = await this.eventRepo.save(event);

    // 3. 同步更新每个 invitee 的 user.events 字符串数组
    for (const user of invitees) {
      const freshUser = await this.userRepo.findOne({ where: { id: user.id } });
      if (freshUser) {
        const currentEvents = freshUser.events ?? [];
        // 避免重复添加
        if (!currentEvents.includes(String(saved.id))) {
          freshUser.events = [...currentEvents, String(saved.id)];
          await this.userRepo.save(freshUser);
        }
      }
    }

    return saved;
  }

  /**
   * 根据 ID 查询事件（含 invitees）
   */
  async findOne(id: number): Promise<Event> {
    const event = await this.eventRepo.findOne({
      where: { id },
      relations: ['invitees'],
    });
    if (!event) throw new NotFoundException(`Event #${id} not found`);
    return event;
  }

  /**
   * 删除事件
   * 同时从所有 invitee 的 user.events 字符串数组中移除该 ID
   */
  async remove(id: number): Promise<void> {
    const event = await this.findOne(id);

    // 从每个 invitee 的 user.events 中移除这个 event ID
    for (const invitee of event.invitees ?? []) {
      const user = await this.userRepo.findOne({ where: { id: invitee.id } });
      if (user) {
        user.events = (user.events ?? []).filter((eid) => eid !== String(id));
        await this.userRepo.save(user);
      }
    }

    await this.eventRepo.remove(event);
  }

  /**
   * 合并指定用户所有时间重叠的事件
   *
   * 流程：
   * 1. 从 user.events（字符串数组）中取出 Event ID，查出对应 Event 实体
   * 2. 按 startTime 排序，分组重叠区间
   * 3. 对每组（>1 个事件）执行合并：删旧事件、创建新合并事件
   * 4. 更新 user.events 为合并后的新 ID 列表
   *
   * Merge algorithm: sort by startTime → group overlapping intervals →
   * for each group: delete originals, create merged event, update user.events strings.
   */
  async mergeAll(userId: number): Promise<Event[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User #${userId} not found`);

    // 1. 通过 user.events 字符串数组查出对应的 Event 实体
    const eventIds = (user.events ?? [])
      .filter((s) => s !== '')
      .map((s) => Number(s));

    if (eventIds.length === 0) return [];

    const events = await this.eventRepo.find({
      where: { id: In(eventIds) },
      relations: ['invitees'],
    });

    // 按开始时间排序
    events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // 2. 分组：把时间重叠的 events 归入同一组
    const groups: Event[][] = [];
    let currentGroup: Event[] = [events[0]];
    let groupEnd = events[0].endTime.getTime();

    for (let i = 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.startTime.getTime() < groupEnd) {
        // 重叠 → 加入当前组，扩展结束时间
        currentGroup.push(ev);
        groupEnd = Math.max(groupEnd, ev.endTime.getTime());
      } else {
        // 不重叠 → 新开一组
        groups.push(currentGroup);
        currentGroup = [ev];
        groupEnd = ev.endTime.getTime();
      }
    }
    groups.push(currentGroup);

    // 3. 处理每一组
    const resultEvents: Event[] = [];
    // 记录 合并后的 eventId → 被替换的旧 eventIds（字符串）
    // 用于之后同步其他 invitee 的 user.events 字符串数组
    const replacedIdsMap = new Map<number, string[]>();

    for (const group of groups) {
      if (group.length === 1) {
        resultEvents.push(group[0]); // 单个事件，无需合并
        continue;
      }

      // 合并字段
      const mergedTitle = group.map((e) => e.title).join(' | ');
      const mergedDescription =
        group.map((e) => e.description).filter(Boolean).join(' | ') ||
        undefined;

      // 取最高优先级状态
      const mergedStatus = group.reduce((best, e) =>
        STATUS_PRIORITY[e.status] > STATUS_PRIORITY[best.status] ? e : best,
      ).status;

      const mergedStart = new Date(
        Math.min(...group.map((e) => e.startTime.getTime())),
      );
      const mergedEnd = new Date(
        Math.max(...group.map((e) => e.endTime.getTime())),
      );

      // 合并 invitees（去重）
      const inviteeMap = new Map<number, User>();
      for (const e of group) {
        for (const u of e.invitees ?? []) {
          inviteeMap.set(u.id, u);
        }
      }
      const mergedInvitees = Array.from(inviteeMap.values());

      // ⚠️ 在 remove 之前先记录旧 ID，remove 后 TypeORM 会把 id 清空
      const oldGroupIds = group.map((e) => String(e.id));

      // 删除旧 events
      await this.eventRepo.remove(group);

      // 保存新合并 event
      const merged = this.eventRepo.create({
        title: mergedTitle,
        description: mergedDescription,
        status: mergedStatus,
        startTime: mergedStart,
        endTime: mergedEnd,
        invitees: mergedInvitees,
      });
      const saved = await this.eventRepo.save(merged);
      resultEvents.push(saved);

      // 记录此次合并的映射关系，供后续同步 invitees 使用
      replacedIdsMap.set(saved.id, oldGroupIds);
    }

    // 4. 更新 user.events 为新的 ID 字符串列表
    user.events = resultEvents.map((e) => String(e.id));
    await this.userRepo.save(user);

    // 同步更新其他 invitee 的 user.events
    for (const event of resultEvents) {
      const oldIds = replacedIdsMap.get(event.id) ?? [];
      if (oldIds.length === 0) continue; // 单个未合并的事件，无需同步

      for (const invitee of event.invitees ?? []) {
        if (invitee.id === userId) continue; // 当前 user 已经更新过了
        const otherUser = await this.userRepo.findOne({
          where: { id: invitee.id },
        });
        if (otherUser) {
          // 移除旧 event IDs，加入新 merged event ID，用 Set 去重防止重复
          const updated = new Set([
            ...(otherUser.events ?? []).filter((eid) => !oldIds.includes(eid)),
            String(event.id),
          ]);
          otherUser.events = Array.from(updated);
          await this.userRepo.save(otherUser);
        }
      }
    }

    // 所有 DB 更新完成后，重新从数据库加载最新数据再返回
    // 避免返回 invitees 里带着更新前的旧 user.events 数据（stale data）
    const freshResults = await this.eventRepo.find({
      where: { id: In(resultEvents.map((e) => e.id)) },
      relations: ['invitees'],
    });

    return freshResults;
  }
}
