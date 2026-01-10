import { NextResponse } from "next/server";
import { getJobbossAccessToken } from "@/lib/jobbossAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const baseUrl = (process.env.JOBBOSS_API_BASE_URL || "").trim();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Missing JOBBOSS_API_BASE_URL in .env.local" },
      { status: 500 }
    );
  }

  const token = await getJobbossAccessToken();

  const url = new URL(req.url);

  // Pass through ANY query params you call this route with.
  // We'll use these for date filtering from the UI.
  const qs = url.searchParams.toString();

  // IMPORTANT: use the details endpoint (not time-tickets)
  const upstream = `${baseUrl.replace(/\/$/, "")}/api/v1/time-ticket-details${
    qs ? `?${qs}` : ""
  }`;

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
