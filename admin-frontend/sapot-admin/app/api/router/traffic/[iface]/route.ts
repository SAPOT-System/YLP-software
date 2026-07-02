import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";

export async function GET(
  req: Request,
  { params }: { params: { iface: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit") ?? "100";
		 const par = await params;

    const res = await secureFetch(
      `/admin/router/traffic/${par.iface}?limit=${limit}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch traffic data" },
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
