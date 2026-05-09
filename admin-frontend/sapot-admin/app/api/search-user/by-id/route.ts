import { NextRequest, NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function POST(request: NextRequest) {
  try {
    // 1. Get the body data sent from your React component
    const { searchParams } = new URL(request.url);
    const identifier_string = searchParams.get("identifier_string");
    console.log("identifier stirng", identifier_string);

    // 2. Forward that data to your FastAPI backend
    const res = await secureFetch(`/user-utils/search-user/{id}?user_id=${identifier_string}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }); 
    
    // 3. Handle errors from FastAPI (like the 400 or 500 you raised)
    if (!res.ok) {
      const errorDetail = await res.json();
      return NextResponse.json(
        { error: errorDetail.detail || 'Failed to create user' }, 
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data); 

  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
