"use client";

import { useRef, useState } from "react";
import { type UploadResponse, uploadMediaFile } from "@/lib/admin-api";

type MarkdownMediaUploaderProps = {
  defaultValue?: string;
  name?: string;
  onChange?: (value: string) => void;
  rows?: number;
  value?: string;
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function getDisplayName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim();

  return withoutExtension.length > 0 ? withoutExtension : "media";
}

function isSupportedFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

function markdownForUpload(file: File, upload: UploadResponse): string {
  const label = getDisplayName(file.name);

  if (upload.contentType.startsWith("image/")) {
    return `![${label}](${upload.url})`;
  }

  if (upload.contentType.startsWith("video/")) {
    return `[${label}](${upload.url})`;
  }

  return `[${label}](${upload.url})`;
}

export function MarkdownMediaUploader({
  defaultValue = "",
  name = "markdown",
  onChange,
  rows = 12,
  value,
}: MarkdownMediaUploaderProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const markdown = value ?? internalValue;

  function updateMarkdown(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
  }

  function insertAtCursor(snippet: string) {
    const textarea = textareaRef.current;
    const currentMarkdown = textarea?.value ?? markdown;

    if (!textarea) {
      updateMarkdown(
        currentMarkdown.length > 0
          ? `${currentMarkdown}\n\n${snippet}`
          : snippet,
      );
      return;
    }

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const before = currentMarkdown.slice(0, selectionStart);
    const after = currentMarkdown.slice(selectionEnd);
    const prefix = before.length > 0 && !before.endsWith("\n") ? "\n\n" : "";
    const suffix = after.length > 0 && !after.startsWith("\n") ? "\n\n" : "";
    const nextValue = `${before}${prefix}${snippet}${suffix}${after}`;
    const nextCursorPosition = before.length + prefix.length + snippet.length;

    updateMarkdown(nextValue);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  function selectFile(file: File | null) {
    setError(null);
    setLastUpload(null);

    if (!file) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (!isSupportedFile(file)) {
      setSelectedFile(null);
      setError("Choose an image or video file.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setSelectedFile(null);
      setError("Choose a file smaller than 100 MB.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setSelectedFile(file);
  }

  async function submitUpload() {
    if (!selectedFile) {
      setError("Choose a file before uploading.");
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const upload = await uploadMediaFile(selectedFile);
      setLastUpload(upload);
      insertAtCursor(markdownForUpload(selectedFile, upload));
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      console.error("Media upload failed", uploadError);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Media upload failed",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm font-bold" htmlFor="markdown-input">
        Markdown
        <textarea
          className="min-h-72 w-full resize-y rounded-md border border-border bg-background px-3 py-3 font-mono text-sm font-normal leading-6 text-foreground outline-none focus:border-accent"
          id="markdown-input"
          name={name}
          onChange={(event) => updateMarkdown(event.target.value)}
          ref={textareaRef}
          rows={rows}
          value={markdown}
        />
      </label>

      <div className="grid gap-3 rounded-lg border border-border bg-panel p-4">
        <label className="grid gap-2 text-sm font-bold" htmlFor="media-upload">
          Media
          <input
            accept="image/*,video/*"
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
            disabled={isUploading}
            id="media-upload"
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            ref={fileInputRef}
            type="file"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!selectedFile || isUploading}
            onClick={() => void submitUpload()}
            type="button"
          >
            {isUploading ? "Uploading" : "Upload and insert"}
          </button>
          {selectedFile ? (
            <span className="text-sm text-muted">{selectedFile.name}</span>
          ) : null}
        </div>

        {error ? <p className="m-0 text-sm text-red-700">{error}</p> : null}
        {lastUpload ? (
          <p className="m-0 break-all text-xs text-muted">
            {lastUpload.relativeKey}
          </p>
        ) : null}
      </div>
    </div>
  );
}
