/**
 * Event Entity
 *
 * Event.invitees 是与 User 的多对多关系（单向，由 Event 这侧持有 JoinTable）。
 * User.events 那侧只存字符串 ID，不维护 TypeORM 关系，所以这里是单向关联。
 *
 * Event.invitees is a unidirectional ManyToMany to User.
 * The join table (event_invitees_user) is owned by this side.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum EventStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: EventStatus, default: EventStatus.TODO })
  status: EventStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz' })
  startTime: Date;

  @Column({ type: 'timestamptz' })
  endTime: Date;

  /**
   * 受邀用户列表（多对多，单向）
   *
   * @JoinTable() 放在这里 → TypeORM 创建中间表 event_invitees_user
   * eager: true → 查询 Event 时自动加载 invitees，无需手动指定 relations
   *
   * Unidirectional ManyToMany: Event owns the join table.
   * eager: true auto-loads invitees on every Event query.
   */
  @ManyToMany(() => User, { eager: true })
  @JoinTable()
  invitees: User[];
}
