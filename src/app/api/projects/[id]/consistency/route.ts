import { NextRequest, NextResponse } from "next/server";
import {
  extractConsistencyFacts,
  getConsistencyFacts,
} from "@/core/consistency/extractFacts";
import { jsonError } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const facts = await getConsistencyFacts(id);
    return NextResponse.json({ facts });
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await extractConsistencyFacts(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("not found")) return jsonError(msg, 404);
    return jsonError(msg, 500);
  }
}
