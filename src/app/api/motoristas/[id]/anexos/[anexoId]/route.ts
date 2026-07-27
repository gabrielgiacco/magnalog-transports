import { NextRequest } from "next/server";
import { anexosDelete } from "@/lib/anexos";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; anexoId: string } }) {
  return anexosDelete(params.anexoId, { ownerType: "MOTORISTA", ownerId: params.id });
}
