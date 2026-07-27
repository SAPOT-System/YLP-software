import { NextRequest, NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Must match the name syncEngine.pull() sends. Reading the wrong key made
    // every pull fall back to 0, so the backend replayed the first page for
    // ever and the pagination loop never terminated.
    const last = searchParams.get('last_pulled_at') || '0';
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
