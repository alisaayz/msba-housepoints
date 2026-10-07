import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const entries=sqliteTable('entries',{
  id:text('id').primaryKey(),
  student:text('student').notNull(),
  house:text('house').notNull(),
  points:integer('points').notNull(),
  reason:text('reason').notNull(),
  createdAt:text('created_at').notNull(),
  deletedAt:text('deleted_at'),
}, table=>[index('idx_entries_created_at').on(table.createdAt)]);
export const houseTotals=sqliteTable('house_totals',{house:text('house').primaryKey(),points:integer('points').notNull().default(0)});
export const authAttempts=sqliteTable('auth_attempts',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expires:integer('expires').notNull()});
