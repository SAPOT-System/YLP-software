import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // ✅ Extract query params
    const page = searchParams.get("page") || "1";
    const size = searchParams.get("size") || "10";
    const keyword = searchParams.get("keyword") || "";

    // ✅ Build query string
    const query = new URLSearchParams({
      page,
      size,
      keyword,
    }).toString();
    
    // ✅ Forward to backend
    const res = await secureFetch(`/api/admin/get-logs?${query}`);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch logs" },
        { status: res.status }
      );
    }

    const data = await res.json();
    console.log("data", data)
    return NextResponse.json(data);
  } catch (error) {
    console.error("API ERROR:", error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
