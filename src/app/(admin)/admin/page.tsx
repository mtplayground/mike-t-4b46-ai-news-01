import { MarkdownMediaUploader } from "@/components/markdown-media-uploader";

export default function AdminPage() {
  return (
    <main className="mx-auto grid w-full max-w-[1080px] gap-8 px-3 py-8 sm:px-4 sm:py-12">
      <header className="mb-8 grid gap-3">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          Admin
        </p>
        <h1 className="m-0 max-w-3xl text-4xl leading-tight sm:text-6xl">
          Upload media for markdown.
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          Select an image or video, upload it to object storage, and insert the
          returned URL into markdown.
        </p>
      </header>

      <section
        aria-label="Markdown media uploader"
        className="rounded-lg border border-border bg-panel p-5"
      >
        <MarkdownMediaUploader />
      </section>
    </main>
  );
}
