import { NextResponse, NextRequest } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit') || '25';
    const offset = searchParams.get('offset') || '0';
    const direction = searchParams.get('direction');
    const phone = searchParams.get('phone');

    // Build query string
    let queryString = `?limit=${limit}&offset=${offset}`;
    if (direction) queryString += `&direction=${direction}`;
    if (phone) queryString += `&phone=${phone}`;

    const res = await secureFetch(`/gsm/sms/messages${queryString}`);
    
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
