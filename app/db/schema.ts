import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["student", "admin"]);
export const externalLinkKind = pgEnum("external_link_kind", [
  "podcast",
  "website",
  "blog",
  "mail",
  "other",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auth0Sub: text("auth0_sub").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    role: userRole("role").notNull().default("student"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    auth0SubIdx: uniqueIndex("users_auth0_sub_idx").on(t.auth0Sub),
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    coverKey: text("cover_key"),
    sortOrder: integer("sort_order").notNull().default(0),
    published: boolean("published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("courses_slug_idx").on(t.slug),
  }),
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userCourseIdx: uniqueIndex("enrollments_user_course_idx").on(
      t.userId,
      t.courseId,
    ),
  }),
);

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    courseIdx: index("modules_course_idx").on(t.courseId),
  }),
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructionsMd: text("instructions_md").notNull().default(""),
    videoKey: text("video_key").notNull(),
    subtitlesKey: text("subtitles_key"),
    durationSec: integer("duration_sec").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    moduleIdx: index("videos_module_idx").on(t.moduleId),
  }),
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    fileKey: text("file_key").notNull(),
    contentType: text("content_type").notNull().default("application/pdf"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    moduleIdx: index("attachments_module_idx").on(t.moduleId),
  }),
);

export const videoProgress = pgTable(
  "video_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastPositionSec: integer("last_position_sec").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    userVideoIdx: uniqueIndex("video_progress_user_video_idx").on(
      t.userId,
      t.videoId,
    ),
  }),
);

export const externalLinks = pgTable("external_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  kind: externalLinkKind("kind").notNull().default("other"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations -----------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  enrollments: many(enrollments),
  progress: many(videoProgress),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  modules: many(modules),
  enrollments: many(enrollments),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, { fields: [enrollments.userId], references: [users.id] }),
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
  course: one(courses, {
    fields: [modules.courseId],
    references: [courses.id],
  }),
  videos: many(videos),
  attachments: many(attachments),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  module: one(modules, {
    fields: [videos.moduleId],
    references: [modules.id],
  }),
  progress: many(videoProgress),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  module: one(modules, {
    fields: [attachments.moduleId],
    references: [modules.id],
  }),
}));

export const videoProgressRelations = relations(videoProgress, ({ one }) => ({
  user: one(users, {
    fields: [videoProgress.userId],
    references: [users.id],
  }),
  video: one(videos, {
    fields: [videoProgress.videoId],
    references: [videos.id],
  }),
}));
