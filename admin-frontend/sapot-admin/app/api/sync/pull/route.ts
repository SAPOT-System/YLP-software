import { NextRequest, NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const last = searchParams.get('last') || '0';
    const limit = searchParams.get('limit') || '100';
    
    const res = await secureFetch(`/sync/pull?last_pulled_at=${last}&limit=${limit}`); 
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data); // Returns a PLAIN object to the client
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
