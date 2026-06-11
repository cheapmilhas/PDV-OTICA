import { notifyCompany } from "@/services/saas-notification.service";

/** Dispara o email/in-app de boas-vindas. Fail-silent (notifyCompany nunca relança). */
export async function sendWelcomeEmail(companyId: string, name: string): Promise<void> {
  const loginUrl = `${process.env.NEXTAUTH_URL ?? "https://app.vis.app.br"}/login`;
  await notifyCompany(
    companyId,
    "WELCOME",
    { name, loginUrl },
    {
      periodKey: "welcome",
      channels: ["email", "inapp"],
      inapp: { title: "Bem-vindo ao Vis", message: "Sua conta está ativa. Explore o sistema.", link: "/dashboard" },
    }
  );
}
