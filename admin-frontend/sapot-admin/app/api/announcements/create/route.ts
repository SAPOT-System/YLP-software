import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const params = new URLSearchParams({
      title: body.title,
      content: body.content,
      priority: body.priority,
      target_audience: body.target_audience,
      expires_at: body.expires_at,
    });

    const res = await secureFetch(
      `/api/admin/post-announcement?${params.toString()}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
        },
        // ❗️ NO BODY (matches your curl)
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: errorText || "Failed to create announcement" },
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
