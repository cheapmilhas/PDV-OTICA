import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/api", "/login", "/impersonate", "/force-logout"],
      },
    ],
    sitemap: "https://pdv-otica.vercel.app/sitemap.xml",
  };
}
