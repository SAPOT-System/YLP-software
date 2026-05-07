import { NextRequest, NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await secureFetch(`/sync/push`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Push failed" },
        { status: res.status }
      );
    }

    const data = await res.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
