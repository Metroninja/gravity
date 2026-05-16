import { and, eq } from "drizzle-orm";
import { data } from "react-router";

import { db } from "./db.server";
import { courses, enrollments } from "~/db/schema";

/**
 * Resolve a course by slug for an enrolled user. Throws a 404 if missing,
 * 403 if the user isn't enrolled.
 */
export async function getEnrolledCourse(userId: string, slug: string) {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.slug, slug), eq(courses.published, true)))
    .limit(1);

  if (!course) {
    throw data({ message: "Programma niet gevonden" }, { status: 404 });
  }

  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, course.id)),
    )
    .limit(1);

  if (!enrollment) {
    throw data(
      { message: "Geen toegang tot dit programma" },
      { status: 403 },
    );
  }

  return course;
}
