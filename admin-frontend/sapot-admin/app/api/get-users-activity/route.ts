import { NextRequest, NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const page = searchParams.get('page') || '1';
	const size = searchParams.get('size') || '10';
	const backendUrl = `/admin/users-activity?page=${page}&size=${size}`
  try {
    const res = await secureFetch(backendUrl); 
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data); // Returns a PLAIN object to the client
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
