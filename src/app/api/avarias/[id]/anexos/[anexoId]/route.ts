import { NextRequest } from "next/server";
import { anexosDelete, anexosSetVisibilidade } from "@/lib/anexos";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; anexoId: string } }) {
  return anexosSetVisibilidade(req, params.anexoId, { ownerType: "AVARIA", ownerId: params.id });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; anexoId: string } }) {
  return anexosDelete(params.anexoId, { ownerType: "AVARIA", ownerId: params.id });
}
