import { MarkdownMediaUploader } from "@/components/markdown-media-uploader";
import { SubspaceAdminPanel } from "@/components/subspace-admin-panel";
import type { SerializedSubspace } from "@/app/actions/subspaces";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getSubspaces(): Promise<SerializedSubspace[]> {
  const subspaces = await prisma.subspace.findMany({
    orderBy: [
      {
        name: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  return subspaces.map((subspace) => ({
    createdAt: subspace.createdAt.toISOString(),
    description: subspace.description,
    id: subspace.id,
    name: subspace.name,
    slug: subspace.slug,
    updatedAt: subspace.updatedAt.toISOString(),
  }));
}

export default async function AdminPage() {
  const subspaces = await getSubspaces();

  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-3 py-8 sm:px-4 sm:py-12">
      <header className="mb-8 grid gap-3">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          Admin
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          Manage AI News content.
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          Create and maintain subspaces, then upload media for markdown posts.
        </p>
      </header>

      <section
        aria-label="Subspace management"
        className="rounded-lg border border-border bg-panel p-5"
      >
        <SubspaceAdminPanel initialSubspaces={subspaces} />
      </section>

      <section
        aria-label="Markdown media uploader"
        className="rounded-lg border border-border bg-panel p-5"
      >
        <MarkdownMediaUploader />
      </section>
    </main>
  );
}
