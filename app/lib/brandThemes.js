import { ADISORN_LOGO_SRC } from "@/app/lib/brandDocuments";

export const pharadolTheme = {
  id: "pharadol",
  name: "PHARADOL PRODUCTION",
  shortName: "PHARADOL",
  tagline: "FILM & STILL",
  logo: "/customer-form/pharadol-logo-gold-transparent-v2.png",
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
  logo: ADISORN_LOGO_SRC,
  primary: "#000000",
  primaryDark: "#111111",
  accent: "#000000",
  accentSoft: "#F7F7F7",
  background: "#FAFAFA",
  card: "#FFFFFF",
  border: "#E5E5E5",
  text: "#111111",
  muted: "#6B7280",
  danger: "#DC2626",
  success: "#16A34A",
  sidebarBg: "#111111",
  sidebarSecondary: "#111111",
  sidebarActiveBg: "#000000",
  sidebarText: "#FFFFFF",
  sidebarMuted: "#D4D4D4",
  sidebarSignedInBg: "rgba(255, 255, 255, 0.08)",
  sidebarSignedInBorder: "rgba(17,17,17,0.22)",
  sidebarIconActiveBg: "#F7F7F7",
  sidebarIconActiveColor: "#000000",
  tableHeaderBg: "#000000",
  tableHeaderText: "#FFFFFF",
  activeTabBg: "#000000",
  activeTabText: "#FFFFFF",
  activeBorder: "rgba(17,17,17,0.48)",
  chromeHoverBg: "#222222",
  buttonPrimary: "#000000",
  buttonPrimaryHover: "#222222",
  buttonGold: "#000000",
  buttonGoldHover: "#222222",
  buttonSecondary: "#FFFFFF",
  actionViewBg: "#000000",
  actionViewHover: "#222222",
  actionArchiveBg: "#000000",
  actionArchiveHover: "#222222",
  actionArchiveText: "#FFFFFF",
  actionDangerBg: "#DC2626",
  actionDangerHover: "#B91C1C",
  statusPendingBg: "#FFF3D7",
  statusPendingText: "#9A5B00",
  statusPendingBorder: "#E7C77D",
  shadow: "rgba(17,17,17,0.07)",
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
