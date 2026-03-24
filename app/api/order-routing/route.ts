import { NextResponse } from "next/server";
import { getJobbossAccessToken } from "../../../lib/jobbossAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeJB2Query(searchParams: URLSearchParams) {
  const out = new URLSearchParams();

  for (const [key, value] of searchParams.entries()) {
    // Convert filters[field][op] -> field[op]
    const m = key.match(/^filters\[(.+?)\]\[(.+?)\]$/);
    if (m) {
      const field = m[1];
      const op = m[2];
      const newKey = `${field}[${op}]`;
      out.set(newKey, value);
      continue;
    }

    // Pass through non-filter params like take, skip, sort
    out.set(key, value);
  }

  return out.toString();
}

export async function GET(req: Request) {
  try {
    const baseUrl = (process.env.JOBBOSS_API_BASE_URL || "").trim();
    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing JOBBOSS_API_BASE_URL in env vars" },
        { status: 500 }
      );
    }

    const token = await getJobbossAccessToken();

    const url = new URL(req.url);
    const qs = normalizeJB2Query(url.searchParams);

    const upstreamBase = baseUrl.replace(/\/$/, "");
    const upstream = `${upstreamBase}/api/v1/order-routings${qs ? `?${qs}` : ""}`;

    const upstreamRes = await fetch(upstream, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const text = await upstreamRes.text();

    if (!upstreamRes.ok) {
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        body = (text || "").slice(0, 2000);
      }

      return NextResponse.json(
        {
          ok: false,
          error: "JB2 /order-routings request failed",
          upstream: {
            url: upstream,
            status: upstreamRes.status,
            statusText: upstreamRes.statusText,
            body,
          },
        },
        { status: 500 }
      );
    }

    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unhandled error in /api/order-routing";
    const stack = e instanceof Error ? e.stack : null;
    return NextResponse.json({ ok: false, error: msg, stack }, { status: 500 });
  }
}