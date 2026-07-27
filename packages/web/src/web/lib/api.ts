// NOTE: this typed hono/client `api` export is unused/legacy boilerplate from the
// starter template. All frontend pages call the API via `authFetch` (see
// ../lib/authFetch.ts) instead. Kept for reference; safe to remove if unneeded.
import { hc } from "hono/client";
import type { AppType } from "../../api/index";

const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:4200";
const client = hc<AppType>(baseUrl);
export const api = client.api;
