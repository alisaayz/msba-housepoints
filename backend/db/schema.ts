import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const entries=sqliteTable('entries',{
  id:text('id').primaryKey(),
  student:text('student').notNull(),
  house:text('house').notNull(),
  points:integer('points').notNull(),
  reason:text('reason').notNull(),
  createdAt:text('created_at').notNull(),
}, table=>[index('idx_entries_created_at').on(table.createdAt)]);
