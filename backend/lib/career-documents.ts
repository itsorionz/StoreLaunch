import "server-only";
import { db } from "./db";

/**
 * Read side for the admin-only career-resume route. A resume is stored as PDF
 * bytes on the application row (or as an external link); this loads the bytes
 * for download. Nothing here is public.
 */
export async function getCareerResume(id: string) {
  return db.careerApplication.findUnique({
    where: { id },
    select: { resumeFile: true, resumeFileName: true, resumeMimeType: true },
  });
}
