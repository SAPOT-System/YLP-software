import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit") ?? "50";

    const res = await secureFetch(
      `/api/admin/router/health/history?limit=${limit}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch router health history" },
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
