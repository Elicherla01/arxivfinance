/**
 * Shared between the server data layer and client components. Kept apart from
 * `lib/arxiv.ts` so importing a constant does not pull the whole arXiv client
 * into the browser bundle.
 */
export const REVALIDATE_SECONDS = 1800;
