import { NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function GET() {
  try {
    const res = await secureFetch("/user-utils/current-user-info"); 
    
    if (!res.ok) {
      console.error("Current-user upstream request failed", { status: res.status });
      return NextResponse.json(
        { error: "Unable to load the current user." },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data); // Returns a PLAIN object to the client
  } catch (error) {
    console.error("Current-user proxy failed", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
