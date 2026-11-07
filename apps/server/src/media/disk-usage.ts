import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** The bytes in each folder under `dir` (each séance's), by folder name. */
export async function bytesByFolder(dir: string): Promise<Map<string, number>> {
  const names = await readdir(dir).catch(() => []);
  return new Map(await Promise.all(names.map(async (name) => [name, await folderBytes(join(dir, name))] as const)));
}

async function folderBytes(dir: string): Promise<number> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  const sizes = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      // A file deleted meanwhile (a temporary source segment) simply does not count.
      .map((entry) =>
        stat(join(entry.parentPath, entry.name)).then(
          (info) => info.size,
          () => 0,
        ),
      ),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}
