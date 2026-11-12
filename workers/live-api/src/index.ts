/**
 * PuneVerse Live API — Cloudflare Worker (zero-cost providers).
 *
 * Open-Meteo: no API key (free non-commercial). Optional OPENAQ_API_KEY later.
 * Never invent readings. Cache snapshots ~10 minutes.
 *
 * Deploy: cd workers/live-api && npx wrangler deploy
 * Local:  npx wrangler dev
 */

import { buildOpenMeteoSnapshot } from "./openMeteo";

export interface Env {
  /** Optional — OpenAQ station feed (Phase 2). Free registration key. */
  OPENAQ_API_KEY?: string;
  ALLOW_ORIGIN?: string;
}

type BBox = [number, number, number, number];

const CACHE_TTL_SECONDS = 600;

function corsHeaders(origin: string | null, allow: string | undefined): HeadersInit {
  const allowed =
    allow ||
    "https://udayjadhav.github.io,http://127.0.0.1:5173,http://localhost:5173";
  const list = allowed.split(",").map((s) => s.trim());
  const ok = origin && list.includes(origin) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    "Content-Type": "application/json; charset=utf-8",
  };
}

function parseBbox(url: URL): BBox {
  const west = Number(url.searchParams.get("west"));
  const south = Number(url.searchParams.get("south"));
  const east = Number(url.searchParams.get("east"));
  const north = Number(url.searchParams.get("north"));
  if ([west, south, east, north].every(Number.isFinite)) return [west, south, east, north];
  return [73.74191, 18.35025, 73.99835, 18.59984];
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin, env.ALLOW_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "puneverse-live-api",
          providers: ["open-meteo"],
          openaq: Boolean(env.OPENAQ_API_KEY),
        }),
        { headers },
      );
    }

    if (url.pathname !== "/v1/live") {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers });
    }

    const bbox = parseBbox(url);
    const cacheKey = new Request(
      `https://puneverse-live-cache.local/v1/live?${bbox.map((n) => n.toFixed(4)).join(",")}`,
      request,
    );

    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const h = new Headers(cached.headers);
      const cors = corsHeaders(origin, env.ALLOW_ORIGIN);
      for (const [k, v] of Object.entries(cors)) h.set(k, v);
      h.set("X-PuneVerse-Cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers: h });
    }

    try {
      const snapshot = await buildOpenMeteoSnapshot(bbox);
      // OPENAQ_API_KEY reserved for Phase 2 station overlay (merge later).
      const body = JSON.stringify(snapshot);
      const res = new Response(body, { status: 200, headers });
      const toCache = res.clone();
      toCache.headers.set("Cache-Control", `public, max-age=${CACHE_TTL_SECONDS}`);
      ctx.waitUntil(cache.put(cacheKey, toCache));
      const outHeaders = new Headers(res.headers);
      outHeaders.set("X-PuneVerse-Cache", "MISS");
      return new Response(body, { status: 200, headers: outHeaders });
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: "upstream_failed",
          message: String((e as Error)?.message ?? e).slice(0, 200),
        }),
        { status: 502, headers },
      );
    }
  },
};
