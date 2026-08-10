import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function GET() {
  try {
    const res = await secureFetch("/api/admin/router/health/latest");

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch latest router health" },
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
