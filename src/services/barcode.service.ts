import { prisma } from "@/lib/prisma";
import { BarcodeType } from "@prisma/client";
import type { CreateBarcodeDTO } from "@/lib/validations/barcode.schema";
import {
  generateEAN13,
  generateCode128,
  generateQRCodeData,
} from "@/lib/validations/barcode.schema";

export class BarcodeService {
  /**
   * Cria um novo código de barras para um produto
   */
  async create(
    data: CreateBarcodeDTO,
    userId: string | undefined,
    companyId: string
  ) {
    // Verifica se produto existe
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        companyId,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        salePrice: true,
      },
    });

    if (!product) {
      throw new Error("Produto não encontrado");
    }

    // Gera código se não foi fornecido
    let code = data.code;

    if (!code) {
      switch (data.type) {
        case BarcodeType.EAN13:
          code = generateEAN13(product.sku);
          break;
        case BarcodeType.CODE128:
          code = generateCode128(product.sku);
          break;
        case BarcodeType.QRCODE:
          code = generateQRCodeData({
            id: product.id,
            sku: product.sku,
            name: product.name,
            salePrice: Number(product.salePrice),
          });
          break;
        default:
          throw new Error("Tipo de código inválido");
      }
    }

    // Verifica se código já existe
    const existing = await prisma.productBarcode.findFirst({
      where: {
        code,
      },
    });

    if (existing) {
      throw new Error("Este código já está sendo usado por outro produto");
    }

    // Se isPrimary, desmarca os outros códigos do produto
    if (data.isPrimary) {
      await prisma.productBarcode.updateMany({
        where: {
          productId: product.id,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    // Cria o código
    const barcode = await prisma.productBarcode.create({
      data: {
        productId: product.id,
        type: data.type,
        code,
        isPrimary: data.isPrimary,
        createdByUserId: userId,
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return barcode;
  }

  /**
   * Lista códigos de um produto
   */
  async list(productId: string, companyId: string) {
    // Verifica se produto existe e pertence à empresa
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        companyId,
      },
    });

    if (!product) {
      throw new Error("Produto não encontrado");
    }

    const barcodes = await prisma.productBarcode.findMany({
      where: {
        productId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });

    return barcodes;
  }

  /**
   * Define um código como primário
   */
  async setPrimary(barcodeId: string, productId: string, companyId: string) {
    // Verifica se código existe
    const barcode = await prisma.productBarcode.findFirst({
      where: {
        id: barcodeId,
        productId,
      },
      include: {
        product: true,
      },
    });

    if (!barcode) {
      throw new Error("Código não encontrado");
    }

    if (barcode.product.companyId !== companyId) {
      throw new Error("Produto não pertence a esta empresa");
    }

    // Desmarca outros códigos como primário
    await prisma.productBarcode.updateMany({
      where: {
        productId,
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });

    // Marca este como primário
    const updated = await prisma.productBarcode.update({
      where: {
        id: barcodeId,
      },
      data: {
        isPrimary: true,
      },
      include: {
        product: true,
      },
    });

    return updated;
  }

  /**
   * Deleta um código de barras
   */
  async delete(barcodeId: string, productId: string, companyId: string) {
    const barcode = await prisma.productBarcode.findFirst({
      where: {
        id: barcodeId,
        productId,
      },
      include: {
        product: true,
      },
    });

    if (!barcode) {
      throw new Error("Código não encontrado");
    }

    if (barcode.product.companyId !== companyId) {
      throw new Error("Produto não pertence a esta empresa");
    }

    await prisma.productBarcode.delete({
      where: {
        id: barcodeId,
      },
    });

    return { success: true };
  }

  /**
   * Busca produto por código de barras
   */
  async findProductByCode(code: string, companyId: string) {
    // Primeiro tenta pelos códigos cadastrados (ProductBarcode)
    const barcode = await prisma.productBarcode.findFirst({
      where: {
        code,
      },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
            supplier: true,
          },
        },
      },
    });

    if (barcode && barcode.product.companyId === companyId) {
      return barcode.product;
    }

    // Se não encontrou, tenta pelo campo barcode do produto (código do fabricante)
    const product = await prisma.product.findFirst({
      where: {
        companyId,
        barcode: code,
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        barcodes: true,
      },
    });

    return product;
  }

  /**
   * Busca código primário de um produto
   */
  async getPrimaryCode(productId: string) {
    const primary = await prisma.productBarcode.findFirst({
      where: {
        productId,
        isPrimary: true,
      },
    });

    return primary;
  }

  /**
   * Gera múltiplos códigos para um produto de uma vez
   */
  async generateAll(
    productId: string,
    userId: string | undefined,
    companyId: string
  ) {
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        companyId,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        salePrice: true,
      },
    });

    if (!product) {
      throw new Error("Produto não encontrado");
    }

    const codes = [];

    // Gera EAN-13
    try {
      const ean13 = await this.create(
        {
          productId,
          type: BarcodeType.EAN13,
          isPrimary: true, // EAN13 será o primário
        },
        userId,
        companyId
      );
      codes.push(ean13);
    } catch (error) {
      // Se já existe, ignora
    }

    // Gera Code-128
    try {
      const code128 = await this.create(
        {
          productId,
          type: BarcodeType.CODE128,
          isPrimary: false,
        },
        userId,
        companyId
      );
      codes.push(code128);
    } catch (error) {
      // Se já existe, ignora
    }

    // Gera QR Code
    try {
      const qrcode = await this.create(
        {
          productId,
          type: BarcodeType.QRCODE,
          isPrimary: false,
        },
        userId,
        companyId
      );
      codes.push(qrcode);
    } catch (error) {
      // Se já existe, ignora
    }

    return codes;
  }

  /**
   * Valida se um código está disponível
   */
  async isCodeAvailable(code: string): Promise<boolean> {
    const existing = await prisma.productBarcode.findFirst({
      where: {
        code,
      },
    });

    return !existing;
  }
}
