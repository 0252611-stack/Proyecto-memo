-- Una reseña debe apuntar exactamente a un álbum O a una canción, nunca a ambos ni a
-- ninguno. SQLite no permite añadir un CHECK con ALTER TABLE, así que se reconstruye la
-- tabla siguiendo el patrón que usa el propio Prisma para SQLite.

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "albumId" TEXT,
    "trackId" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "context" TEXT,
    "listenedOn" DATETIME,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_exactly_one_target" CHECK (("albumId" IS NULL) <> ("trackId" IS NULL)),
    CONSTRAINT "Review_rating_range" CHECK ("rating" >= 1 AND "rating" <= 10)
);

INSERT INTO "new_Review" ("id", "albumId", "trackId", "rating", "title", "body", "context", "listenedOn", "isFavorite", "createdAt", "updatedAt")
SELECT "id", "albumId", "trackId", "rating", "title", "body", "context", "listenedOn", "isFavorite", "createdAt", "updatedAt" FROM "Review";

DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";

CREATE INDEX "Review_albumId_idx" ON "Review"("albumId");
CREATE INDEX "Review_trackId_idx" ON "Review"("trackId");
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

PRAGMA foreign_keys=ON;
