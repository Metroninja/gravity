/**
 * Demo seed: creates an admin user, one student, one published course with
 * two modules, three videos, and one PDF attachment. Re-running is safe:
 * every record is keyed on a deterministic identifier.
 *
 * The script also uploads a small placeholder MP4 and PDF to the configured
 * storage (fake-gcs-server in dev, real GCS in prod) so the video player has
 * something to point at out of the box.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { Storage } from "@google-cloud/storage";
import { eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  attachments,
  courses,
  enrollments,
  externalLinks,
  modules,
  users,
  videos,
} from "../app/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
const GCS_BUCKET = process.env.GCS_BUCKET ?? "janneke-media";
const GCS_EMULATOR_HOST = process.env.GCS_EMULATOR_HOST;
const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID ?? "janneke-local";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run the seed.");
}

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
const db = drizzle(sql);

const storage = GCS_EMULATOR_HOST
  ? new Storage({
      apiEndpoint: GCS_EMULATOR_HOST,
      projectId: GCS_PROJECT_ID,
      useAuthWithCustomEndpoint: false,
    })
  : new Storage({ projectId: GCS_PROJECT_ID });

const bucket = storage.bucket(GCS_BUCKET);

async function ensureBucket() {
  try {
    const [exists] = await bucket.exists();
    if (!exists) {
      await bucket.create();
      console.log(`Created bucket ${GCS_BUCKET}`);
    }
  } catch (err) {
    if (!GCS_EMULATOR_HOST) throw err;
    // The emulator sometimes returns oddly-shaped responses; tolerate.
    console.warn("Bucket check failed (emulator). Continuing.", err);
  }
}

async function uploadFromDataUri(key: string, dataUri: string, contentType: string) {
  const base64 = dataUri.split(",")[1] ?? dataUri;
  const buf = Buffer.from(base64, "base64");
  await bucket.file(key).save(buf, { contentType, resumable: false });
}

async function uploadFile(key: string, sourcePath: string, contentType: string) {
  const buf = await fs.readFile(sourcePath);
  await bucket.file(key).save(buf, { contentType, resumable: false });
}

const SAMPLE_PDF_BASE64 =
  "JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxID4+CmVuZG9iagozIDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0gL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNCAwIFIgPj4gPj4gL0NvbnRlbnRzIDUgMCBSID4+CmVuZG9iago0IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKNSAwIG9iago8PCAvTGVuZ3RoIDQ0ID4+CnN0cmVhbQpCVAovRjEgMjQgVGYKNzIgNzUwIFRkCihKYW5uZWtlIC0gZGVtbykgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2NCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMzkgMDAwMDAgbiAKMDAwMDAwMDMxMyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQwMgolJUVPRgo=";

const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:04.000
Welkom bij Janneke van der Wouw.

00:00:04.000 --> 00:00:08.000
Dit is een voorbeeld-ondertitel.
`;

async function main() {
  await ensureBucket();

  // Storage keys
  const coverKey = "demo/course-cover.png";
  const videoKey = "demo/welcome.mp4";
  const subtitlesKey = "demo/welcome.vtt";
  const pdfKey = "demo/workbook.pdf";

  // Upload placeholder media. We use Google's well-known sample MP4 only if
  // the file is present locally; otherwise we skip the video upload and the
  // video URL will simply 404 until the instructor replaces the file.
  const localSample = path.resolve("seed/assets/sample.mp4");
  try {
    await fs.access(localSample);
    await uploadFile(videoKey, localSample, "video/mp4");
    console.log("Uploaded sample video.");
  } catch {
    console.warn(
      `Skipping video upload — drop a file at ${localSample} to seed one. ` +
        "The player will show an error until a file is uploaded to this key.",
    );
  }

  await uploadFromDataUri(pdfKey, SAMPLE_PDF_BASE64, "application/pdf");
  await bucket.file(subtitlesKey).save(SAMPLE_VTT, {
    contentType: "text/vtt",
    resumable: false,
  });
  // 1x1 transparent PNG for the cover.
  await uploadFromDataUri(
    coverKey,
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "image/png",
  );

  // ---- Users -----------------------------------------------------------
  const [admin] = await db
    .insert(users)
    .values({
      auth0Sub: "seed|admin",
      email: "admin@janneke.local",
      name: "Janneke (admin)",
      role: "admin",
    })
    .onConflictDoUpdate({
      target: users.auth0Sub,
      set: { email: "admin@janneke.local", name: "Janneke (admin)" },
    })
    .returning();

  const [student] = await db
    .insert(users)
    .values({
      auth0Sub: "seed|student",
      email: "student@janneke.local",
      name: "Demo cursist",
      role: "student",
    })
    .onConflictDoUpdate({
      target: users.auth0Sub,
      set: { email: "student@janneke.local", name: "Demo cursist" },
    })
    .returning();

  // ---- Course ----------------------------------------------------------
  const [course] = await db
    .insert(courses)
    .values({
      slug: "welkom",
      title: "Welkom programma",
      description:
        "Een korte introductie van Janneke. Bekijk de video's, gebruik de werkbladen en werk in je eigen tempo.",
      coverKey,
      sortOrder: 0,
      published: true,
    })
    .onConflictDoUpdate({
      target: courses.slug,
      set: {
        title: "Welkom programma",
        description:
          "Een korte introductie van Janneke. Bekijk de video's, gebruik de werkbladen en werk in je eigen tempo.",
        coverKey,
        published: true,
      },
    })
    .returning();

  // Enroll the demo student.
  await db
    .insert(enrollments)
    .values({ userId: student.id, courseId: course.id })
    .onConflictDoNothing();

  // ---- Modules + videos + attachments ----------------------------------
  // Re-seeding: delete existing children to keep the script idempotent.
  await db.delete(modules).where(eq(modules.courseId, course.id));

  const [moduleOne] = await db
    .insert(modules)
    .values({ courseId: course.id, title: "Module 1 — Welkom", sortOrder: 0 })
    .returning();
  const [moduleTwo] = await db
    .insert(modules)
    .values({
      courseId: course.id,
      title: "Module 2 — Aan de slag",
      sortOrder: 1,
    })
    .returning();

  await db.insert(videos).values([
    {
      moduleId: moduleOne.id,
      title: "Welkom",
      instructionsMd:
        "Bekijk deze korte introductievideo. Pak een notitieboek erbij en schrijf op wat opvalt.",
      videoKey,
      subtitlesKey,
      durationSec: 90,
      sortOrder: 0,
    },
    {
      moduleId: moduleOne.id,
      title: "Wat ga je leren",
      instructionsMd:
        "In deze video neem ik je mee door de opzet van het programma.",
      videoKey,
      subtitlesKey,
      durationSec: 180,
      sortOrder: 1,
    },
    {
      moduleId: moduleTwo.id,
      title: "Eerste oefening",
      instructionsMd:
        "Doe de oefening uit de PDF en koppel je inzichten in het volgende videogesprek.",
      videoKey,
      subtitlesKey,
      durationSec: 240,
      sortOrder: 0,
    },
  ]);

  await db.insert(attachments).values({
    moduleId: moduleTwo.id,
    title: "Werkblad — eerste oefening",
    fileKey: pdfKey,
    contentType: "application/pdf",
    sizeBytes: 450,
    sortOrder: 0,
  });

  // ---- Promote allow-listed admin emails -------------------------------
  // Mirrors the hardcoded list in app/lib/admins.server.ts. Safe to run on
  // every seed — only upgrades existing rows; never demotes anyone.
  const adminEmails = [
    "metroninja@gmail.com",
    "janneke@jannekevdwouw.com",
  ];
  await db
    .update(users)
    .set({ role: "admin" })
    .where(
      inArray(
        drizzleSql<string>`lower(${users.email})`,
        adminEmails.map((e) => e.toLowerCase()),
      ),
    );

  // ---- External links --------------------------------------------------
  await db.delete(externalLinks);
  await db.insert(externalLinks).values([
    {
      label: "Podcast op Spotify",
      url: "https://open.spotify.com/",
      kind: "podcast",
      sortOrder: 0,
    },
    {
      label: "Website",
      url: "https://example.com",
      kind: "website",
      sortOrder: 1,
    },
    {
      label: "Blog",
      url: "https://example.com/blog",
      kind: "blog",
      sortOrder: 2,
    },
    {
      label: "Mail Janneke",
      url: "mailto:hello@janneke.example",
      kind: "mail",
      sortOrder: 3,
    },
  ]);

  console.log("Seeded:");
  console.log(`  admin user   : ${admin.email}`);
  console.log(`  student user : ${student.email}`);
  console.log(`  course       : /${course.slug}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end();
  });
