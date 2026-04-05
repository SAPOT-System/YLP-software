import { NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function GET() {
  try {
    const res = await secureFetch('/admin/users-activity'); 
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data); // Returns a PLAIN object to the client
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
