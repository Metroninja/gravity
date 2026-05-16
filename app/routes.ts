import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("auth/callback", "routes/auth.callback.tsx"),
  route("auth/logout", "routes/auth.logout.tsx"),

  layout("routes/_app.tsx", [
    route("courses", "routes/courses._index.tsx"),
    route("courses/:slug", "routes/courses.$slug.tsx"),
    route("courses/:slug/:videoId", "routes/courses.$slug.$videoId.tsx"),
  ]),

  route("admin", "routes/admin.tsx", [
    index("routes/admin._index.tsx"),
    route("courses", "routes/admin.courses._index.tsx"),
    route("courses/new", "routes/admin.courses.new.tsx"),
    route("courses/:slug/edit", "routes/admin.courses.$slug.edit.tsx"),
    route("courses/:slug/students", "routes/admin.courses.$slug.students.tsx"),
    route(
      "courses/:slug/modules/:moduleId",
      "routes/admin.courses.$slug.modules.$moduleId.tsx",
    ),
    route(
      "courses/:slug/modules/:moduleId/videos/new",
      "routes/admin.courses.$slug.modules.$moduleId.videos.new.tsx",
    ),
    route(
      "courses/:slug/modules/:moduleId/videos/:videoId/edit",
      "routes/admin.courses.$slug.modules.$moduleId.videos.$videoId.edit.tsx",
    ),
    route("users", "routes/admin.users._index.tsx"),
    route("users/:userId", "routes/admin.users.$userId.tsx"),
  ]),

  route("api/progress", "routes/api.progress.tsx"),
  route("api/videos/:videoId/url", "routes/api.videos.$videoId.url.tsx"),
  route("api/admin/upload", "routes/api.admin.upload.tsx"),
] satisfies RouteConfig;
