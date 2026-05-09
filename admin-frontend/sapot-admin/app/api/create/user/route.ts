import { NextResponse } from 'next/server';
import { secureFetch } from "@/api/fetch";

export async function POST(request) {
  try {
    // 1. Get the body data sent from your React component
    const body = await request.json();

    // 2. Forward that data to your FastAPI backend
    const res = await secureFetch('/admin/create/user', {
      method: 'POST', // Ensure method is POST
      body: JSON.stringify(body), // Convert JS object to JSON string
      headers: {
        'Content-Type': 'application/json',
      },
    }); 

		console.log("SECURE fetch", res);
    
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
