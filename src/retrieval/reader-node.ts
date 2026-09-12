// FsRangeReader is kept out of src/retrieval/reader.ts, the module src/app/main.ts imports
// for the browser. Even though the node:fs/promises import below is dynamic (only ever
// executed in Node), Vite detects the specifier as reachable from main.ts's import graph and
// externalizes it, printing a warning on every `pnpm build`. In its own Node-only module the
// browser graph contains no node: specifier at all; the browser never imports this file.
import type { RangeReader } from "./reader";
import { ReconstructionFailure } from "./failures";

export class FsRangeReader implements RangeReader {
  constructor(private path: string) {}
  async read(offset: number, length: number): Promise<Uint8Array> {
    const { open } = await import("node:fs/promises");
    const fh = await open(this.path, "r");
    try {
      const buf = new Uint8Array(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      if (bytesRead !== length) {
        throw new ReconstructionFailure("RangeReadFailed", { url: this.path, detail: `short read: ${bytesRead} of ${length} bytes at offset ${offset}` });
      }
      return buf;
    } finally {
      await fh.close();
    }
  }
}
