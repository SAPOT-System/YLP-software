import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function POST(request: Request) {
  try {
    // ✅ Get body from frontend
    const body = await request.json();

    // ✅ Forward request to backend
    const res = await secureFetch("/update/profile/", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.json();

      return NextResponse.json(
        {
          error: errorData?.detail || "Failed to update profile",
        },
        { status: res.status }
      );
    }

    const data = await res.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("UPDATE PROFILE API ERROR:", error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
