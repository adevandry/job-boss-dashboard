import { NextResponse } from "next/server";
import { getJobbossAccessToken } from "@/lib/jobbossAuth";

export const runtime = "nodejs";

function normalizeJB2Query(searchParams: URLSearchParams) {
  const out = new URLSearchParams();

  for (const [key, value] of searchParams.entries()) {
    // Convert filters[field][op] -> field[op]
    const m = key.match(/^filters\[(.+?)\]\[(.+?)\]$/);
    if (m) {
      const field = m[1];
      const op = m[2];
      const newKey = `${field}[${op}]`;

      // If the UI sends date-only, JB2 is picky. Convert to ISO Z range.
      if (field === "ticketDate" && (op === "gte" || op === "lte") && value.length === 10) {
        const v = op === "gte" ? `${value}T00:00:00Z` : `${value}T23:59:59Z`;
        out.set(newKey, v);
      } else {
        out.set(newKey, value);
      }

      continue;
    }

    // Pass through non-filter params like take, skip, sort
    out.set(key, value);
  }

  return out.toString();
}

export async function GET(req: Request) {
  const baseUrl = (process.env.JOBBOSS_API_BASE_URL || "").trim();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Missing JOBBOSS_API_BASE_URL in Vercel env vars" },
      { status: 500 }
    );
  }

  const token = await getJobbossAccessToken();

  const url = new URL(req.url);
  const qs = normalizeJB2Query(url.searchParams);

  const upstreamBase = baseUrl.replace(/\/$/, "");
  const upstream = `${upstreamBase}/api/v1/time-ticket-details${qs ? `?${qs}` : ""}`;

  const upstreamRes = await fetch(upstream, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const text = await upstreamRes.text();

  return new NextResponse(text, {
    status: upstreamRes.status,
    headers: { "Content-Type": "application/json" },
  });
}
