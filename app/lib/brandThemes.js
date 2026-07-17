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
  primary: "#3A2117",
  primaryDark: "#2A1710",
  accent: "#C9A46A",
  accentSoft: "#F3E6CF",
  background: "#FAF7F1",
  card: "#FFFFFF",
  border: "#E8D8C2",
  text: "#2B1A14",
  muted: "#7A6A5D",
  danger: "#EF4444",
  success: "#16A34A",
  sidebarBg: "#2A1710",
  sidebarSecondary: "#3A2117",
  sidebarActiveBg: "rgba(201, 164, 106, 0.16)",
  sidebarText: "#FFF8EF",
  sidebarMuted: "#CDBFAA",
  sidebarSignedInBg: "rgba(255, 255, 255, 0.08)",
  sidebarSignedInBorder: "rgba(201, 164, 106, 0.22)",
  sidebarIconActiveBg: "#F3E6CF",
  sidebarIconActiveColor: "#3A2117",
  tableHeaderBg: "#3A2117",
  tableHeaderText: "#FFF8EF",
  activeTabBg: "#3A2117",
  activeTabText: "#FFFFFF",
  activeBorder: "rgba(201, 164, 106, 0.48)",
  chromeHoverBg: "#4A2A1D",
  buttonPrimary: "#3A2117",
  buttonPrimaryHover: "#4A2A1D",
  buttonGold: "#C9A46A",
  buttonGoldHover: "#B88F52",
  buttonSecondary: "#FFFFFF",
  shadow: "rgba(42, 23, 16, 0.08)",
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
