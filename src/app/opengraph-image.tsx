import { ImageResponse } from "next/og";

export const runtime = "edge";
// Esta é a imagem PADRÃO do site — servida na home institucional (dois
// produtos) e em toda página que não define a sua. Falar só de ótica aqui fazia
// o compartilhamento da home e do cadastro médico anunciar o produto errado.
export const alt = "Vis — Sistemas de gestão para óticas e clínicas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0E2A47 0%, #2E6BFF 60%, #22C3E6 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 120,
            fontWeight: 800,
            color: "#FFFFFF",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          Vis
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 700,
            color: "#FFFFFF",
            marginTop: 32,
            letterSpacing: "-0.02em",
          }}
        >
          Dois sistemas. Uma gestão clara.
        </div>
        {/* Dois divs em coluna, não <br />: o Satori (motor do ImageResponse)
            não quebra linha dentro de um flex container. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 28,
            color: "rgba(255,255,255,0.85)",
            marginTop: 24,
            gap: 8,
          }}
        >
          <div style={{ display: "flex" }}>
            Óticas: PDV · OS de lentes · Estoque · Financeiro
          </div>
          <div style={{ display: "flex" }}>
            Clínicas: prontuário · agenda · receituário
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "rgba(255,255,255,0.7)",
            marginTop: 48,
            letterSpacing: "0.08em",
          }}
        >
          VISÃO. CLAREZA. CONFIANÇA. · vis.app.br
        </div>
      </div>
    ),
    { ...size }
  );
}
