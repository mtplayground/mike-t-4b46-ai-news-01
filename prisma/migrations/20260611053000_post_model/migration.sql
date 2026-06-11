-- AlterTable
ALTER TABLE "posts" ADD COLUMN "body_markdown" TEXT NOT NULL;
ALTER TABLE "posts" ADD COLUMN "author_sub" TEXT NOT NULL;
ALTER TABLE "posts" ADD COLUMN "subspace_id" TEXT NOT NULL;
ALTER TABLE "posts" ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "posts" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "posts_author_sub_idx" ON "posts"("author_sub");

-- CreateIndex
CREATE INDEX "posts_subspace_id_idx" ON "posts"("subspace_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_sub_fkey" FOREIGN KEY ("author_sub") REFERENCES "users"("sub") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_subspace_id_fkey" FOREIGN KEY ("subspace_id") REFERENCES "subspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
