ALTER TABLE "StoreSettings"
  ADD COLUMN "headerAnnouncementDirection" TEXT NOT NULL DEFAULT 'left',
  ADD COLUMN "headerAnnouncementSpeed" INTEGER NOT NULL DEFAULT 24;
