import { NextRequest, NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ peerId: string }> }
) {
  try {
    const { peerId } = await params;
    const res = await secureFetch(`/keys/${peerId}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
