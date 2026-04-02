/**
 * User Entity
 *
 * 注意：根据需求文档，User.events 是一个字符串数组（存储 Event ID），
 * 而不是与 Event 的关联关系（ManyToMany）。
 *
 * Per spec: User.events is a plain list of strings (event IDs),
 * NOT a TypeORM relational mapping.
 *
 * Event ←→ User 的多对多关系由 Event.invitees 那一侧单独维护（单向关联）。
 * The ManyToMany join table is owned by Event.invitees (unidirectional).
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /**
   * 用户参与的事件 ID 列表（字符串数组）
   * 例如：["1", "3", "7"]
   *
   * Stored as a PostgreSQL simple-array column.
   * Each entry is a string representation of an Event ID.
   * Updated automatically when events are created or merged.
   */
  @Column('simple-array', { nullable: true, default: '' })
  events: string[];
}
