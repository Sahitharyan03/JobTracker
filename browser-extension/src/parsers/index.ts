import { DetectedJob } from "../types";
import { parseJsonLd } from "./jsonLd";
import { parseGreenhouse } from "./greenhouse";
import { parseLever } from "./lever";
import { parseAshby } from "./ashby";
import { parseWorkday } from "./workday";
import { parseLinkedIn } from "./linkedin";
import { parseIndeed } from "./indeed";
import { parseMetaTags } from "./meta";
import { parseGenericDom } from "./generic";

export function extractJobFromDocument(doc: Document, url: string): DetectedJob | null {
  // Layer 1: JSON-LD structured data (highest fidelity)
  const jsonLdResult = parseJsonLd(doc, url);
  if (jsonLdResult && jsonLdResult.role && jsonLdResult.company) {
    return jsonLdResult;
  }

  // Layer 2: Dedicated platform / ATS parsers
  const greenhouseResult = parseGreenhouse(doc, url);
  if (greenhouseResult && greenhouseResult.role) return greenhouseResult;

  const leverResult = parseLever(doc, url);
  if (leverResult && leverResult.role) return leverResult;

  const ashbyResult = parseAshby(doc, url);
  if (ashbyResult && ashbyResult.role) return ashbyResult;

  const workdayResult = parseWorkday(doc, url);
  if (workdayResult && workdayResult.role) return workdayResult;

  const linkedinResult = parseLinkedIn(doc, url);
  if (linkedinResult && linkedinResult.role) return linkedinResult;

  const indeedResult = parseIndeed(doc, url);
  if (indeedResult && indeedResult.role) return indeedResult;

  // If JSON-LD had a role but no company, fall back to check if we can augment or use it
  if (jsonLdResult && jsonLdResult.role) {
    return jsonLdResult;
  }

  // Layer 3: Meta & OpenGraph tags
  const metaResult = parseMetaTags(doc, url);
  if (metaResult && metaResult.role) return metaResult;

  // Layer 4: Generic DOM heuristics fallback
  const genericResult = parseGenericDom(doc, url);
  if (genericResult && genericResult.role) return genericResult;

  return null;
}
