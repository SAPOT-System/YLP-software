import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();

    const params = await context.params;

    // Convert body to query params
    const queryParams = new URLSearchParams({
      title: body.title,
      content: body.content,
      priority: body.priority,
      target_audience: body.target_audience,
      ...(body.expires_at ? { expires_at: body.expires_at } : {}),
    });
    console.log("PARAMS:", context);

    const res = await secureFetch(
      `/api/admin/announcements/${params.id}?${queryParams.toString()}`,
      {
        method: "PATCH",
        headers: {
          accept: "application/json",
        },
        // ❌ No body, matches curl
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: errorText || "Failed to update announcement" },
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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await params;
    const res = await secureFetch(
      `/api/admin/announcements/${context.id}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to delete announcement" },
        { status: res.status }
      );
    }

    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
