import { NextRequest, NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await secureFetch("/keys/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
