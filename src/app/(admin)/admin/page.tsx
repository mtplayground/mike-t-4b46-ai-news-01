import { AdminContentTabs } from "@/components/admin-content-tabs";
import type {
  SerializedPost,
  SerializedSubspace,
  SerializedTag,
} from "@/lib/admin-api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type ErrorWithDigest = Error & { digest?: string };

function getErrorDigest(error: unknown): string | undefined {
  return error instanceof Error ? (error as ErrorWithDigest).digest : undefined;
}

function logAdminLoaderError(loader: string, error: unknown): void {
  console.error("[admin page] failed to load page data", {
    digest: getErrorDigest(error),
    error,
    loader,
  });
}

async function getSubspaces(): Promise<SerializedSubspace[]> {
  try {
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
  } catch (error) {
    logAdminLoaderError("getSubspaces", error);
    throw error;
  }
}

async function getTags(): Promise<SerializedTag[]> {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: [
        {
          name: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    });

    return tags.map((tag) => ({
      createdAt: tag.createdAt.toISOString(),
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      updatedAt: tag.updatedAt.toISOString(),
    }));
  } catch (error) {
    logAdminLoaderError("getTags", error);
    throw error;
  }
}

async function getPosts(): Promise<SerializedPost[]> {
  try {
    const posts = await prisma.post.findMany({
      include: {
        author: {
          select: {
            email: true,
            name: true,
            pictureUrl: true,
            sub: true,
          },
        },
        subspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
          orderBy: {
            tag: {
              name: "asc",
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return posts.map((post) => ({
      author: post.author,
      authorSub: post.authorSub,
      bodyMarkdown: post.bodyMarkdown,
      createdAt: post.createdAt.toISOString(),
      id: post.id,
      subspace: post.subspace,
      subspaceId: post.subspaceId,
      tags: post.tags.map(({ tag }) => ({
        createdAt: tag.createdAt.toISOString(),
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        updatedAt: tag.updatedAt.toISOString(),
      })),
      updatedAt: post.updatedAt.toISOString(),
    }));
  } catch (error) {
    logAdminLoaderError("getPosts", error);
    throw error;
  }
}

export default async function AdminPage() {
  const [posts, subspaces, tags] = await Promise.all([
    getPosts(),
    getSubspaces(),
    getTags(),
  ]);

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

      <AdminContentTabs posts={posts} subspaces={subspaces} tags={tags} />
    </main>
  );
}
