import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    {
      error: "Upload endpoint is /api/uploads.",
    },
    {
      status: 404,
    },
  );
}
