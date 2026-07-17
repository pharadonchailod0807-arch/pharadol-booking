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
  tableHeaderBg: "#082E25",
  tableHeaderText: "#F8FAF8",
  activeTabBg: "#0B3328",
  activeTabText: "#FFFFFF",
  activeBorder: "rgba(205, 174, 119, 0.45)",
  chromeHoverBg: "#123F33",
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
  tableHeaderBg: "#3A2418",
  tableHeaderText: "#FFF8EF",
  activeTabBg: "#4A2D1E",
  activeTabText: "#FFFFFF",
  activeBorder: "rgba(214, 165, 95, 0.45)",
  chromeHoverBg: "#5A3724",
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

export const getBrandChromeStyles = (brandId) => {
  const theme = getBrandTheme(brandId);

  return {
    theme,
    tableHeader: {
      backgroundColor: theme.tableHeaderBg,
      color: theme.tableHeaderText,
      borderColor: theme.activeBorder,
    },
    activeControl: {
      backgroundColor: theme.activeTabBg,
      color: theme.activeTabText,
      borderColor: theme.activeBorder,
      boxShadow: `0 10px 24px ${theme.shadow}`,
    },
    primaryButton: {
      backgroundColor: theme.activeTabBg,
      color: theme.activeTabText,
      borderColor: theme.activeBorder,
    },
    accentBorder: {
      borderColor: theme.activeBorder,
    },
  };
};
