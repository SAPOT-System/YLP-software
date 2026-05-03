import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const limit = searchParams.get("limit") || "20";
    const offset = searchParams.get("offset") || "0";

    const res = await secureFetch(
      `/admin/get-all-announcements?limit=${limit}&offset=${offset}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch announcements" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
