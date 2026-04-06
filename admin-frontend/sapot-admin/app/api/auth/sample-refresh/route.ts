import { NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";
import { cookies } from "next/headers";

export async function GET() {
  try {
		const cookieStore = await cookies();
		const refresh_token = cookieStore.get("refresh_token")?.value

		const formData = new FormData()
		formData.append("refresh_token", refresh_token);
		const refreshRes = await fetch(`${process.env.API_DOMAIN}/auth/refresh`, 
														 {
			method: "POST",
			headers: {
					'accept': 'application/json',
					'Content-Type': 'application/json'
				},
			body: JSON.stringify({
				refresh_token:refresh_token
			})
		});
		const data = await refreshRes.json();

		console.log("EWAN", data)

    
    // if (!res.ok) {
    //   return NextResponse.json({ error: 'Failed to fetch' }, { status: res.status });
    // }
    //
    // const data = await res.json();
    // return NextResponse.json(data); // Returns a PLAIN object to the client
		return {"status": "ok"}
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
