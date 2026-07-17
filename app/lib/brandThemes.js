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
  primary: "#4A2E22",
  primaryDark: "#2B1A14",
  accent: "#C9A46A",
  accentSoft: "#F3E6CF",
  background: "#FAF7F1",
  card: "#FFFFFF",
  border: "#E9DCCB",
  text: "#2B1A14",
  muted: "#7A6A5D",
  danger: "#DC2626",
  success: "#16A34A",
  sidebarBg: "#2B1A14",
  sidebarSecondary: "#3A2117",
  sidebarActiveBg: "#4A2E22",
  sidebarText: "#FFF8EF",
  sidebarMuted: "#CDBFAA",
  sidebarSignedInBg: "rgba(255, 255, 255, 0.08)",
  sidebarSignedInBorder: "rgba(201, 164, 106, 0.22)",
  sidebarIconActiveBg: "#F3E6CF",
  sidebarIconActiveColor: "#4A2E22",
  tableHeaderBg: "#4A2E22",
  tableHeaderText: "#FFF8EF",
  activeTabBg: "#4A2E22",
  activeTabText: "#FFFFFF",
  activeBorder: "rgba(201, 164, 106, 0.48)",
  chromeHoverBg: "#5A3828",
  buttonPrimary: "#4A2E22",
  buttonPrimaryHover: "#5A3828",
  buttonGold: "#C9A46A",
  buttonGoldHover: "#B88F52",
  buttonSecondary: "#FFFFFF",
  actionViewBg: "#4A2E22",
  actionViewHover: "#5A3828",
  actionArchiveBg: "#C9A46A",
  actionArchiveHover: "#B88F52",
  actionArchiveText: "#111111",
  actionDangerBg: "#DC2626",
  actionDangerHover: "#B91C1C",
  statusPendingBg: "#FFF3D7",
  statusPendingText: "#9A5B00",
  statusPendingBorder: "#E7C77D",
  shadow: "rgba(43, 26, 20, 0.07)",
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
    secondaryButton: {
      backgroundColor: theme.buttonSecondary,
      color: theme.text,
      borderColor: theme.border,
    },
    actionView: {
      backgroundColor: theme.actionViewBg || theme.buttonPrimary,
      color: "#FFFFFF",
      borderColor: theme.actionViewBg || theme.buttonPrimary,
    },
    actionArchive: {
      backgroundColor: theme.actionArchiveBg || theme.accent,
      color: theme.actionArchiveText || "#FFFFFF",
      borderColor: theme.actionArchiveBg || theme.accent,
    },
    actionDanger: {
      backgroundColor: theme.actionDangerBg || theme.danger,
      color: "#FFFFFF",
      borderColor: theme.actionDangerBg || theme.danger,
    },
    actionSuccess: {
      backgroundColor: theme.success,
      color: "#FFFFFF",
      borderColor: theme.success,
    },
    statusPending: {
      backgroundColor: theme.statusPendingBg || theme.accentSoft,
      color: theme.statusPendingText || theme.text,
      borderColor: theme.statusPendingBorder || theme.border,
    },
    accentBorder: {
      borderColor: theme.activeBorder,
    },
  };
};
