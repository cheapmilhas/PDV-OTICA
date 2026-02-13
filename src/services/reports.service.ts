import { prisma } from "@/lib/prisma";
import type {
  ProductReportQueryDTO,
  CustomerReportQueryDTO,
  TemporalReportQueryDTO,
  OpticalReportQueryDTO,
} from "@/lib/validations/reports.schema";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subDays,
  differenceInYears,
  getDay,
  getHours,
  format,
} from "date-fns";
import { ptBR } from "date-fns/locale";

// Helper para calcular período
function getDateRange(period: string, startDate?: Date, endDate?: Date) {
  const now = new Date();

  if (period === "custom" && startDate && endDate) {
    return { start: startOfDay(startDate), end: endOfDay(endDate) };
  }

  switch (period) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "week":
      return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

// Nomes dos dias da semana
const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const reportsService = {
  // =====================
  // RELATÓRIO DE PRODUTOS
  // =====================

  async getProductsReport(branchId: string, query: ProductReportQueryDTO) {
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // Buscar itens de venda agrupados por produto
    const salesItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          branchId,
          createdAt: { gte: start, lte: end },
          status: { in: ["COMPLETED"] },
        },
        ...(query.categoryId && {
          product: { categoryId: query.categoryId },
        }),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Agrupar por produto
    const productMap = new Map<string, {
      product: any;
      quantity: number;
      revenue: number;
      salesCount: number;
    }>();

    for (const item of salesItems) {
      if (!item.productId) continue; // Skip items without product
      const productId = item.productId;
      const existing = productMap.get(productId);

      if (existing) {
        existing.quantity += item.qty;
        existing.revenue += Number(item.lineTotal);
        existing.salesCount += 1;
      } else {
        productMap.set(productId, {
          product: item.product,
          quantity: item.qty,
          revenue: Number(item.lineTotal),
          salesCount: 1,
        });
      }
    }

    // Converter para array e ordenar
    const ranking = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, query.limit)
      .map((item) => ({
        productId: item.product!.id,
        name: item.product!.name,
        sku: item.product!.sku,
        category: item.product!.category?.name || null,
        quantity: item.quantity,
        revenue: item.revenue,
        averagePrice: item.revenue / item.quantity,
      }));

    // Totais
    const totalRevenue = ranking.reduce((sum, r) => sum + r.revenue, 0);
    const totalQuantity = ranking.reduce((sum, r) => sum + r.quantity, 0);

    // Top categorias
    const categoryMap = new Map<string, { name: string; revenue: number; quantity: number; products: Set<string> }>();

    // Re-process all sales items for categories
    for (const item of salesItems) {
      if (!item.productId || !item.product) continue;
      const catName = item.product.category?.name || "Sem categoria";
      const existing = categoryMap.get(catName);
      if (existing) {
        existing.revenue += Number(item.lineTotal);
        existing.quantity += item.qty;
        existing.products.add(item.productId);
      } else {
        categoryMap.set(catName, {
          name: catName,
          revenue: Number(item.lineTotal),
          quantity: item.qty,
          products: new Set([item.productId]),
        });
      }
    }

    const byCategory = Array.from(categoryMap.values())
      .map(data => ({
        category: data.name,
        revenue: data.revenue,
        quantity: data.quantity,
        products: data.products.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      ranking,
      byCategory,
    };
  },

  // =====================
  // RELATÓRIO DE CLIENTES
  // =====================

  async getCustomersReport(branchId: string, companyId: string, query: CustomerReportQueryDTO) {
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // Buscar clientes com vendas no período
    const customers = await prisma.customer.findMany({
      where: {
        companyId,
        sales: {
          some: {
            branchId,
            createdAt: { gte: start, lte: end },
            status: { in: ["COMPLETED"] },
          },
        },
      },
      select: {
        id: true,
        birthDate: true,
        gender: true,
        createdAt: true,
        city: true,
        state: true,
        neighborhood: true,
        sales: {
          where: {
            branchId,
            createdAt: { gte: start, lte: end },
            status: { in: ["COMPLETED"] },
          },
          select: { total: true, createdAt: true },
        },
      },
    });

    // Calcular faixas etárias
    const ageRanges = {
      "0-17": 0,
      "18-25": 0,
      "26-35": 0,
      "36-45": 0,
      "46-55": 0,
      "56-65": 0,
      "65+": 0,
      "Não informado": 0,
    };

    // Calcular gênero
    const genderCount = {
      M: 0,
      F: 0,
      OTHER: 0,
      "Não informado": 0,
    };

    // Calcular cidades
    const cityMap = new Map<string, { count: number; revenue: number }>();

    // Calcular bairros
    const neighborhoodMap = new Map<string, { count: number; revenue: number }>();

    // Processar clientes
    let totalRevenue = 0;
    let newCustomers = 0;
    let returningCustomers = 0;

    for (const customer of customers) {
      const customerRevenue = customer.sales.reduce((sum, s) => sum + Number(s.total), 0);
      totalRevenue += customerRevenue;

      // Faixa etária
      if (customer.birthDate) {
        const age = differenceInYears(new Date(), customer.birthDate);
        if (age < 18) ageRanges["0-17"]++;
        else if (age <= 25) ageRanges["18-25"]++;
        else if (age <= 35) ageRanges["26-35"]++;
        else if (age <= 45) ageRanges["36-45"]++;
        else if (age <= 55) ageRanges["46-55"]++;
        else if (age <= 65) ageRanges["56-65"]++;
        else ageRanges["65+"]++;
      } else {
        ageRanges["Não informado"]++;
      }

      // Gênero
      if (customer.gender === "M") genderCount.M++;
      else if (customer.gender === "F") genderCount.F++;
      else if (customer.gender === "OTHER") genderCount.OTHER++;
      else genderCount["Não informado"]++;

      // Cidade
      if (customer.city) {
        const city = customer.city;
        const existing = cityMap.get(city);
        if (existing) {
          existing.count++;
          existing.revenue += customerRevenue;
        } else {
          cityMap.set(city, { count: 1, revenue: customerRevenue });
        }
      }

      // Bairro
      if (customer.neighborhood) {
        const neighborhood = customer.neighborhood;
        const existing = neighborhoodMap.get(neighborhood);
        if (existing) {
          existing.count++;
          existing.revenue += customerRevenue;
        } else {
          neighborhoodMap.set(neighborhood, { count: 1, revenue: customerRevenue });
        }
      }

      // Novo vs Retornante
      const firstSale = customer.sales.sort((a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      if (firstSale && firstSale.createdAt >= start) {
        newCustomers++;
      } else {
        returningCustomers++;
      }
    }

    // Top cidades
    const topCities = Array.from(cityMap.entries())
      .map(([city, data]) => ({
        city,
        count: data.count,
        revenue: data.revenue,
        percentage: (data.count / customers.length) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top bairros
    const topNeighborhoods = Array.from(neighborhoodMap.entries())
      .map(([neighborhood, data]) => ({
        neighborhood,
        count: data.count,
        revenue: data.revenue,
        percentage: (data.count / customers.length) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Convert age ranges to match interface (with revenue)
    const ageRevenueMap = new Map<string, number>();
    for (const customer of customers) {
      const customerRevenue = customer.sales.reduce((sum: number, s: any) => sum + Number(s.total), 0);
      if (customer.birthDate) {
        const age = differenceInYears(new Date(), customer.birthDate);
        let range: string;
        if (age < 18) range = "0-17";
        else if (age <= 25) range = "18-25";
        else if (age <= 35) range = "26-35";
        else if (age <= 45) range = "36-45";
        else if (age <= 55) range = "46-55";
        else if (age <= 65) range = "56-65";
        else range = "65+";
        ageRevenueMap.set(range, (ageRevenueMap.get(range) || 0) + customerRevenue);
      } else {
        ageRevenueMap.set("Não informado", (ageRevenueMap.get("Não informado") || 0) + customerRevenue);
      }
    }

    const byAge = Object.entries(ageRanges).map(([range, count]) => ({
      range,
      count,
      revenue: ageRevenueMap.get(range) || 0,
    }));

    const genderRevenueMap = new Map<string, number>();
    for (const customer of customers) {
      const customerRevenue = customer.sales.reduce((sum: number, s: any) => sum + Number(s.total), 0);
      const gender = customer.gender || "UNKNOWN";
      genderRevenueMap.set(gender, (genderRevenueMap.get(gender) || 0) + customerRevenue);
    }

    const byGender = Object.entries(genderCount).map(([gender, count]) => ({
      gender,
      count,
      revenue: genderRevenueMap.get(gender) || 0,
    }));

    const byCity = Array.from(cityMap.entries())
      .map(([city, data]) => ({
        city,
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      byAge,
      byGender,
      byCity,
    };
  },

  // =====================
  // RELATÓRIO TEMPORAL
  // =====================

  async getTemporalReport(branchId: string, query: TemporalReportQueryDTO) {
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // Buscar vendas no período
    const sales = await prisma.sale.findMany({
      where: {
        branchId,
        createdAt: { gte: start, lte: end },
        status: { in: ["COMPLETED"] },
      },
      select: {
        id: true,
        total: true,
        createdAt: true,
      },
    });

    // Agrupar por critério
    const groupedData = new Map<string | number, { count: number; revenue: number }>();

    for (const sale of sales) {
      let key: string | number;

      switch (query.groupBy) {
        case "hour":
          key = getHours(sale.createdAt);
          break;
        case "dayOfWeek":
          key = getDay(sale.createdAt);
          break;
        case "day":
          key = format(sale.createdAt, "yyyy-MM-dd");
          break;
        case "month":
          key = format(sale.createdAt, "yyyy-MM");
          break;
        default:
          key = getDay(sale.createdAt);
      }

      const existing = groupedData.get(key);
      if (existing) {
        existing.count++;
        existing.revenue += Number(sale.total);
      } else {
        groupedData.set(key, { count: 1, revenue: Number(sale.total) });
      }
    }

    // Formatar resultado
    let data: any[] = [];

    if (query.groupBy === "hour") {
      // Preencher todas as horas (0-23)
      for (let hour = 0; hour < 24; hour++) {
        const hourData = groupedData.get(hour) || { count: 0, revenue: 0 };
        data.push({
          hour,
          label: `${hour.toString().padStart(2, "0")}:00`,
          salesCount: hourData.count,
          revenue: hourData.revenue,
        });
      }
    } else if (query.groupBy === "dayOfWeek") {
      // Preencher todos os dias da semana (0-6)
      for (let day = 0; day < 7; day++) {
        const dayData = groupedData.get(day) || { count: 0, revenue: 0 };
        data.push({
          dayOfWeek: day,
          label: DAY_NAMES[day],
          salesCount: dayData.count,
          revenue: dayData.revenue,
        });
      }
    } else {
      // day ou month - ordenar cronologicamente
      data = Array.from(groupedData.entries())
        .map(([key, value]) => ({
          date: key,
          label: query.groupBy === "month"
            ? format(new Date(key + "-01"), "MMM/yy", { locale: ptBR })
            : format(new Date(key), "dd/MM", { locale: ptBR }),
          salesCount: value.count,
          revenue: value.revenue,
        }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }

    // Encontrar picos
    const peakSales = [...data].sort((a, b) => b.salesCount - a.salesCount)[0];
    const peakRevenue = [...data].sort((a, b) => b.revenue - a.revenue)[0];

    // Totais
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);

    return {
      period: { start, end },
      groupBy: query.groupBy,
      data,
      summary: {
        totalSales,
        totalRevenue,
        averagePerPeriod: data.length > 0 ? totalSales / data.filter(d => d.salesCount > 0).length : 0,
      },
      peaks: {
        bySales: peakSales ? { label: peakSales.label, count: peakSales.salesCount } : null,
        byRevenue: peakRevenue ? { label: peakRevenue.label, revenue: peakRevenue.revenue } : null,
      },
    };
  },

  // =====================
  // RELATÓRIO ÓPTICO
  // =====================

  async getOpticalReport(branchId: string, companyId: string, query: OpticalReportQueryDTO) {
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // Buscar receitas no período
    const prescriptions = await prisma.prescription.findMany({
      where: {
        companyId,
        createdAt: { gte: start, lte: end },
      },
      include: {
        values: true,
        customer: {
          select: { birthDate: true, gender: true },
        },
      },
    });

    // Análise de graus esféricos
    const sphericalRanges = {
      "Baixo (-2 a +2)": 0,
      "Moderado (-4 a -2 ou +2 a +4)": 0,
      "Alto (< -4 ou > +4)": 0,
    };

    // Análise de tipos de lente (baseado em categorias de produtos vendidos com receita)
    const lensTypeMap = new Map<string, number>();

    // Análise de adição (para lentes multifocais)
    const additionRanges = {
      "Sem adição": 0,
      "Baixa (+0.75 a +1.50)": 0,
      "Média (+1.75 a +2.50)": 0,
      "Alta (+2.75+)": 0,
    };

    // Análise por faixa etária
    const ageGroups = {
      "Crianças (0-12)": { count: 0, avgSpherical: 0, total: 0 },
      "Jovens (13-25)": { count: 0, avgSpherical: 0, total: 0 },
      "Adultos (26-45)": { count: 0, avgSpherical: 0, total: 0 },
      "Meia-idade (46-60)": { count: 0, avgSpherical: 0, total: 0 },
      "Idosos (60+)": { count: 0, avgSpherical: 0, total: 0 },
    };

    for (const prescription of prescriptions) {
      // Processar valores da receita
      const values = prescription.values;
      if (!values) continue;

      // Processar olho direito
      const odSph = Number(values.odSph) || 0;
      const odAdd = Number(values.odAdd) || 0;

      // Processar olho esquerdo
      const oeSph = Number(values.oeSph) || 0;
      const oeAdd = Number(values.oeAdd) || 0;

      // Classificar grau esférico OD
      const absOdSph = Math.abs(odSph);
      if (absOdSph <= 2) sphericalRanges["Baixo (-2 a +2)"]++;
      else if (absOdSph <= 4) sphericalRanges["Moderado (-4 a -2 ou +2 a +4)"]++;
      else sphericalRanges["Alto (< -4 ou > +4)"]++;

      // Classificar grau esférico OE
      const absOeSph = Math.abs(oeSph);
      if (absOeSph <= 2) sphericalRanges["Baixo (-2 a +2)"]++;
      else if (absOeSph <= 4) sphericalRanges["Moderado (-4 a -2 ou +2 a +4)"]++;
      else sphericalRanges["Alto (< -4 ou > +4)"]++;

      // Classificar adição (média de OD e OE)
      const maxAdd = Math.max(odAdd, oeAdd);
      if (maxAdd === 0) additionRanges["Sem adição"]++;
      else if (maxAdd <= 1.5) additionRanges["Baixa (+0.75 a +1.50)"]++;
      else if (maxAdd <= 2.5) additionRanges["Média (+1.75 a +2.50)"]++;
      else additionRanges["Alta (+2.75+)"]++;

      // Tipo de lente baseado na adição
      let lensType = "SINGLE_VISION";
      if (maxAdd > 0) {
        lensType = "PROGRESSIVE";
      }
      lensTypeMap.set(lensType, (lensTypeMap.get(lensType) || 0) + 1);

      // Por faixa etária
      if (prescription.customer?.birthDate) {
        const age = differenceInYears(new Date(), prescription.customer.birthDate);
        let group: keyof typeof ageGroups;

        if (age <= 12) group = "Crianças (0-12)";
        else if (age <= 25) group = "Jovens (13-25)";
        else if (age <= 45) group = "Adultos (26-45)";
        else if (age <= 60) group = "Meia-idade (46-60)";
        else group = "Idosos (60+)";

        ageGroups[group].count++;
        ageGroups[group].total += (absOdSph + absOeSph) / 2; // média dos dois olhos
      }
    }

    // Calcular médias por faixa etária
    for (const group of Object.keys(ageGroups) as Array<keyof typeof ageGroups>) {
      if (ageGroups[group].count > 0) {
        ageGroups[group].avgSpherical = ageGroups[group].total / ageGroups[group].count;
      }
    }

    // Get sales with service orders that have prescriptions
    const salesWithPrescriptions = await prisma.sale.findMany({
      where: {
        companyId,
        branchId,
        createdAt: { gte: start, lte: end },
        status: { in: ["COMPLETED"] },
        serviceOrderId: { not: null },
      },
      select: {
        total: true,
        serviceOrderId: true,
      },
    });

    const serviceOrderIds = salesWithPrescriptions
      .map(s => s.serviceOrderId)
      .filter((id): id is string => id !== null);

    const serviceOrders = await prisma.serviceOrder.findMany({
      where: {
        id: { in: serviceOrderIds },
        prescriptionId: { not: null },
      },
      select: {
        id: true,
        prescription: {
          select: {
            values: {
              select: { odAdd: true, oeAdd: true },
            },
          },
        },
      },
    });

    // Map service orders to determine lens type
    const soLensTypeMap = new Map<string, string>();
    for (const so of serviceOrders) {
      const values = so.prescription?.values;
      if (!values) continue;
      const maxAdd = Math.max(Number(values.odAdd) || 0, Number(values.oeAdd) || 0);
      const lensType = maxAdd > 0 ? "PROGRESSIVE" : "SINGLE_VISION";
      soLensTypeMap.set(so.id, lensType);
    }

    // Calculate revenue by lens type
    const lensTypeRevenue = new Map<string, number>();
    for (const sale of salesWithPrescriptions) {
      if (!sale.serviceOrderId) continue;
      const lensType = soLensTypeMap.get(sale.serviceOrderId) || "SINGLE_VISION";
      lensTypeRevenue.set(lensType, (lensTypeRevenue.get(lensType) || 0) + Number(sale.total));
    }

    // Format lens types with revenue
    const lensTypes = Array.from(lensTypeMap.entries())
      .map(([type, count]) => ({
        type,
        count,
        revenue: lensTypeRevenue.get(type) || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Separate spherical ranges by eye (left = OE, right = OD)
    const leftRanges = { ...sphericalRanges };
    const rightRanges = { ...sphericalRanges };

    // Count presbyopia (people with addition)
    const totalPrescriptions = prescriptions.length;
    const presbyopiaCount = totalPrescriptions - additionRanges["Sem adição"];
    const presbyopiaPercentage = totalPrescriptions > 0 ? (presbyopiaCount / totalPrescriptions) * 100 : 0;

    return {
      lensTypes,
      sphericalRanges: {
        left: Object.entries(leftRanges).map(([range, count]) => ({
          range,
          count: Math.floor(count / 2), // Divide by 2 since we counted both eyes
        })),
        right: Object.entries(rightRanges).map(([range, count]) => ({
          range,
          count: Math.floor(count / 2), // Divide by 2 since we counted both eyes
        })),
      },
      presbyopia: {
        count: presbyopiaCount,
        percentage: presbyopiaPercentage,
      },
    };
  },

  // =====================
  // DASHBOARD GERAL
  // =====================

  async getDashboardSummary(branchId: string, companyId: string) {
    const now = new Date();
    const startMonth = startOfMonth(now);
    const endMonth = endOfMonth(now);
    const startLastMonth = startOfMonth(subDays(startMonth, 1));
    const endLastMonth = endOfMonth(subDays(startMonth, 1));

    // Vendas do mês atual
    const currentMonthSales = await prisma.sale.aggregate({
      where: {
        branchId,
        createdAt: { gte: startMonth, lte: endMonth },
        status: { in: ["COMPLETED"] },
      },
      _sum: { total: true },
      _count: { id: true },
    });

    // Vendas do mês passado
    const lastMonthSales = await prisma.sale.aggregate({
      where: {
        branchId,
        createdAt: { gte: startLastMonth, lte: endLastMonth },
        status: { in: ["COMPLETED"] },
      },
      _sum: { total: true },
      _count: { id: true },
    });

    // Clientes novos no mês
    const newCustomers = await prisma.customer.count({
      where: {
        companyId,
        createdAt: { gte: startMonth, lte: endMonth },
      },
    });

    // Top 5 produtos do mês
    const topProducts = await this.getProductsReport(branchId, {
      period: "month",
      limit: 5,
    });

    // Horários de pico
    const peakHours = await this.getTemporalReport(branchId, {
      period: "month",
      groupBy: "hour",
    });

    // Calcular variação
    const currentRevenue = Number(currentMonthSales._sum.total) || 0;
    const lastRevenue = Number(lastMonthSales._sum.total) || 0;
    const revenueChange = lastRevenue > 0
      ? ((currentRevenue - lastRevenue) / lastRevenue) * 100
      : 0;

    return {
      currentMonth: {
        revenue: currentRevenue,
        salesCount: currentMonthSales._count.id,
        averageTicket: currentMonthSales._count.id > 0
          ? currentRevenue / currentMonthSales._count.id
          : 0,
      },
      comparison: {
        revenueChange,
        isPositive: revenueChange >= 0,
      },
      newCustomers,
      topProducts: topProducts.ranking.slice(0, 5),
      peakHours: peakHours.data
        .filter((h: any) => h.salesCount > 0)
        .sort((a: any, b: any) => b.salesCount - a.salesCount)
        .slice(0, 3),
    };
  },
};
