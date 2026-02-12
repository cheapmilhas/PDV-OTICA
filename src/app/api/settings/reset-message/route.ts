import { NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { settingsService } from "@/services/settings.service";
import { z } from "zod";

const resetSchema = z.object({
  messageType: z.enum(["thankYou", "quote", "reminder", "birthday"]),
});

export async function POST(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();
    const { messageType } = resetSchema.parse(body);

    const settings = await settingsService.resetMessage(companyId, messageType);

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Mensagem restaurada para o padrão",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
