import { NextResponse } from "next/server";
import { MOCK_ETFS } from "../_data";

export async function GET() {
  return NextResponse.json(MOCK_ETFS.filter((e) => e.latest_metrics?.why_featured));
}
