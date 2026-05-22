import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function GET() {
  try {
    const res = await secureFetch(
      "/user-utils/current-user-info"
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch user info" },
        { status: res.status }
      );
    }

    const data = await res.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("CURRENT USER API ERROR:", error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
