import { type Category, SOURCES_BY_CATEGORY } from "@veraz/shared";

/** The category's trusted domains (edited in `@veraz/shared`), deduplicated and cut to the tool's limit. */
export function domainsFor(category: Category, max: number): string[] {
  return [...new Set(SOURCES_BY_CATEGORY[category])].slice(0, max);
}
