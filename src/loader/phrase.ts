import { registry } from "../registry";
registry.get("index.phrase.uppercase");
/** Phrase-index key: uppercase, trailing padding stripped, internal spacing preserved. */
export const phraseKey = (raw: string): string => raw.replace(/\s+$/, "").toUpperCase();
