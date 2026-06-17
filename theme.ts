export const colors = {
  bg: "#0A1628",
  surface: "#112240",
  surfaceHi: "#1A2C4E",
  primary: "#1E88E5",
  primaryHover: "#38BDF8",
  text: "#FFFFFF",
  textMuted: "#94A3B8",
  textDim: "#64748B",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  border: "rgba(255,255,255,0.08)",
};

export const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_language-helper-82/artifacts/zyrfto5w_ChatGPT%20Image%2027%20abr%202026%2C%2010_22_49%20a.m..png";

export const SERVICE_IMAGES: Record<string, string> = {
  exterior:
    "https://static.prod-images.emergentagent.com/jobs/17a3dd0e-cb75-405e-b839-70298f5f8a54/images/80ba665a6034c863b66d5928b82ff77c20a9457ca61b963e8c59e679c33f8094.png",
  interior:
    "https://static.prod-images.emergentagent.com/jobs/17a3dd0e-cb75-405e-b839-70298f5f8a54/images/80913483b5d78d547d4878f897743502422e90f7da86ddbe660978f1bbda34ae.png",
  completa:
    "https://static.prod-images.emergentagent.com/jobs/17a3dd0e-cb75-405e-b839-70298f5f8a54/images/37e0e47b158f17cbaf2c8a2bde43b39856c278e2880808e92326791ef87f32a1.png",
};

export function imageForService(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("interior")) return SERVICE_IMAGES.interior;
  if (n.includes("completa") || n.includes("completo") || n.includes("detail"))
    return SERVICE_IMAGES.completa;
  return SERVICE_IMAGES.exterior;
}
