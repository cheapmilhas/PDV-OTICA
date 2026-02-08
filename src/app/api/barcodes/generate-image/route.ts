import { NextRequest, NextResponse } from "next/server"
import bwipjs from "bwip-js"
import QRCode from "qrcode"

export async function POST(req: NextRequest) {
  try {
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
    console.error("Erro ao gerar imagem do código:", error)
    return NextResponse.json(
      { error: "Erro ao gerar imagem do código" },
      { status: 500 }
    )
  }
}
