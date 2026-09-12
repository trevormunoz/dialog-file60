// Browser-safe: no node: specifier, static or dynamic. The Node-only FsRangeReader lives in
// ./reader-node.ts instead, imported only by Node-side code: scripts/cast.ts and the
// archival tests.
import { ReconstructionFailure } from "./failures";

export interface RangeReader { read(offset: number, length: number): Promise<Uint8Array>; }

export class FetchRangeReader implements RangeReader {
  constructor(private url: string) {}
  async read(offset: number, length: number): Promise<Uint8Array> {
    const res = await fetch(this.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    if (res.status !== 206) throw new ReconstructionFailure("RangeReadFailed", { url: this.url, detail: `range request not honored: HTTP ${res.status}` });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length !== length) {
      throw new ReconstructionFailure("RangeReadFailed", { url: this.url, detail: `short range response: ${bytes.length} of ${length} bytes at offset ${offset}` });
    }
    return bytes;
  }
}
