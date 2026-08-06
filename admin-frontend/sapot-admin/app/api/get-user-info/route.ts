import { NextRequest, NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const backendUrl = `/api/admin/user-info?user_id=${userId}`
  try {
    const res = await secureFetch(backendUrl); 
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch' }, { status: res.status });
    }

    const data = await res.json();
    console.log(data)
    return NextResponse.json(data); // Returns a PLAIN object to the client
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
