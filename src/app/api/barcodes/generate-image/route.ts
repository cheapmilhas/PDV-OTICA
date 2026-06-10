import { NextRequest, NextResponse } from "next/server"
import bwipjs from "bwip-js"
import QRCode from "qrcode"
import { logger } from "@/lib/logger"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/error-handler"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

const log = logger.child({ route: "barcodes/generate-image" })

export async function POST(req: NextRequest) {
  try {
    // SEC-005: rota antes era pública e sem rate-limit (vetor de DoS por
    // geração de imagem). Agora exige login e limita por IP.
    await requireAuth()

    const limit = checkRateLimit(`barcode:${clientIp(req)}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Muitas requisições. Tente novamente em instantes." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
      )
    }

    const { code, type } = await req.json()

    if (!code || !type) {
      return NextResponse.json(
        { error: "Código e tipo são obrigatórios" },
        { status: 400 }
      )
    }

    let imageBuffer: Buffer

    // Normalizar tipo do Prisma para os formatos usados pelas bibliotecas
    if (type === "QRCODE" || type === "QR_CODE") {
      // Gerar QR Code
      const qrDataUrl = await QRCode.toDataURL(code, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: "H",
      })

      // Converter data URL para buffer
      const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "")
      imageBuffer = Buffer.from(base64Data, "base64")
    } else {
      // Gerar código de barras (EAN-13 ou CODE-128)
      const bwipType = (type === "EAN13" || type === "EAN_13") ? "ean13" : "code128"

      imageBuffer = await bwipjs.toBuffer({
        bcid: bwipType,
        text: code,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: "center",
      })
    }

    // Retornar imagem como base64
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`

    return NextResponse.json({ image: base64Image })
  } catch (error) {
    // AppError (ex.: 401 do requireAuth) preserva o status correto via handleApiError.
    if (error && typeof error === "object" && "statusCode" in error) {
      return handleApiError(error)
    }
    log.error("Erro ao gerar imagem do código", { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      { error: "Erro ao gerar imagem do código" },
      { status: 500 }
    )
  }
}
