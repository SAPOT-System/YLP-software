import { NextResponse } from "next/server";
import { secureFetch } from "@/api/fetch";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const res = await secureFetch("/auth/logout", { method: "POST"});
    if (!res.ok) {
      return NextResponse.json(
        { error: "Log out failed" },
        { status: res.status }
      );
    }
		const cookieStore = await cookies();

		cookieStore.delete('access_token');
		cookieStore.delete('refresh_token');
		cookieStore.delete('must_change_password');
		cookieStore.delete('terms_acceptance_required');

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
