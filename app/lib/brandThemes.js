export const pharadolTheme = {
  id: "pharadol",
  name: "PHARADOL PRODUCTION",
  shortName: "PHARADOL",
  tagline: "FILM & STILL",
  logo: "/pharadol-logo.png",
  primary: "#183024",
  primaryDark: "#102018",
  accent: "#C8A060",
  accentSoft: "#F6EFD7",
  background: "#F6F7F3",
  card: "#FFFFFF",
  border: "#DDE5DC",
  text: "#10231C",
  muted: "#66756D",
  danger: "#EF4444",
  success: "#1F8A5B",
  sidebarBg: "#102018",
  sidebarActiveBg: "rgba(200, 160, 96, 0.16)",
  buttonPrimary: "#183024",
  buttonSecondary: "#FFFFFF",
  shadow: "rgba(16, 32, 24, 0.12)",
};

export const adisornTheme = {
  id: "adisorn",
  name: "Adisorn Wedding Studio",
  shortName: "ADISORN",
  tagline: "WEDDING STUDIO",
  logo: "/adisorn-logo.png",
  primary: "#502810",
  primaryDark: "#3E1F0C",
  accent: "#D8A56F",
  accentSoft: "#F8E8D8",
  background: "#FAF8F4",
  card: "#FFFFFF",
  border: "#E8D7C6",
  text: "#2D170C",
  muted: "#7A675C",
  danger: "#EF4444",
  success: "#8A5A2B",
  sidebarBg: "#3E1F0C",
  sidebarActiveBg: "rgba(216, 165, 111, 0.18)",
  buttonPrimary: "#502810",
  buttonSecondary: "#FFFFFF",
  shadow: "rgba(80, 40, 16, 0.13)",
};

export const brandThemes = {
  pharadol: pharadolTheme,
  adisorn: adisornTheme,
};

export const getBrandTheme = (brandId) =>
  brandThemes[brandId] || brandThemes.pharadol;
