import fs from "node:fs/promises";
import path from "node:path";
import type { DocumentType } from "./types.js";

export interface CommentEntry { id: string; by: string; at: string; body: string; }
export interface CommentThread {
  id: string;
  section: string;
  line: number;
  resolved: boolean;
  /** The exact document text this thread is anchored to (Word-style inline
   *  comment). Absent for threads anchored to a whole section. */
  quote?: string;
  comments: CommentEntry[];
}
export interface CommentsFile { version: 1; threads: CommentThread[]; }

export function commentsRelPath(feature: string, type: DocumentType): string {
  return path.posix.join("comments", `${feature}.${type}.json`);
}

export async function readComments(vaultPath: string, feature: string, type: DocumentType): Promise<CommentsFile> {
  try {
    const raw = await fs.readFile(path.join(vaultPath, commentsRelPath(feature, type)), "utf-8");
    const parsed = JSON.parse(raw) as CommentsFile;
    return { version: 1, threads: parsed.threads ?? [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, threads: [] };
    throw err;
  }
}

export async function writeComments(vaultPath: string, feature: string, type: DocumentType, file: CommentsFile): Promise<void> {
  const full = path.join(vaultPath, commentsRelPath(feature, type));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(file, null, 2) + "\n", "utf-8");
}

export function addThread(file: CommentsFile, thread: CommentThread): CommentsFile {
  return { ...file, threads: [...file.threads, thread] };
}

export function addReply(file: CommentsFile, threadId: string, comment: CommentEntry): CommentsFile {
  return {
    ...file,
    threads: file.threads.map((t) => (t.id === threadId ? { ...t, comments: [...t.comments, comment] } : t)),
  };
}

export function setResolved(file: CommentsFile, threadId: string, resolved: boolean): CommentsFile {
  return {
    ...file,
    threads: file.threads.map((t) => (t.id === threadId ? { ...t, resolved } : t)),
  };
}
