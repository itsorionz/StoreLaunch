ALTER TABLE "CareerApplication"
  ADD COLUMN "resumeFile" BYTEA,
  ADD COLUMN "resumeFileName" TEXT,
  ADD COLUMN "resumeMimeType" TEXT;

ALTER TABLE "StoreSettings"
  ADD COLUMN "careerNotificationEmail" TEXT,
  ADD COLUMN "careerEmailSubject" TEXT NOT NULL DEFAULT 'New career application: {{jobTitle}}',
  ADD COLUMN "careerEmailBody" TEXT NOT NULL DEFAULT E'A new application was submitted for {{jobTitle}}.\n\nApplicant: {{applicantName}}\nEmail: {{applicantEmail}}\nPhone: {{applicantPhone}}\nResume: {{resume}}\n\nCover letter:\n{{coverLetter}}\n\nReview application {{applicationId}} in the admin dashboard.';
