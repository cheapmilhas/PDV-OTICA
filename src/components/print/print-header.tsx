interface PrintHeaderProps {
  logoUrl?: string | null;
  companyName?: string;
  cnpj?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
}

/**
 * Cabeçalho Padronizado para Impressos
 *
 * - Logo à esquerda (se houver)
 * - Informações da empresa à direita
 * - Usado em: Vendas, Orçamentos, Ordens de Serviço, Relatório de Caixa
 *
 * Usa <img> nativo (não next/image): data-URLs e impressão via window.print()
 * renderizam de forma mais previsível do que o componente otimizado.
 */
export function PrintHeader({
  logoUrl,
  companyName = "Empresa",
  cnpj,
  address,
  city,
  state,
  phone,
  email,
}: PrintHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-300">
      {/* Logo */}
      <div className="flex-shrink-0 w-32 h-20 relative">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Logo da Empresa"
            className="h-full w-full object-contain object-left"
          />
        ) : (
          <div className="flex items-center h-full">
            <span className="text-2xl font-bold text-gray-700">{companyName}</span>
          </div>
        )}
      </div>

      {/* Informações da Empresa */}
      <div className="text-right text-sm">
        <h1 className="text-lg font-bold mb-1">{companyName}</h1>
        {cnpj && <p className="text-gray-600">CNPJ: {cnpj}</p>}
        {address && (
          <p className="text-gray-600">
            {address}
            {city && `, ${city}`}
            {state && ` - ${state}`}
          </p>
        )}
        {phone && <p className="text-gray-600">Tel: {phone}</p>}
        {email && <p className="text-gray-600">{email}</p>}
      </div>
    </div>
  );
}
