import { NextRequest } from "next/server";
import { anexosList, anexosPresign, anexosConfirm } from "@/lib/anexos";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return anexosList({ ownerType: "AVARIA", ownerId: params.id });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return anexosPresign(req, { ownerType: "AVARIA", ownerId: params.id });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return anexosConfirm(req, { ownerType: "AVARIA", ownerId: params.id });
}
