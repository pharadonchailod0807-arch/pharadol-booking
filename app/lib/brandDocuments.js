export const BRAND_DOCUMENTS = {
  pharadol: {
    name: "PHARADOL PRODUCTION",
    eyebrow: "FILM & STILL",
    logo: "/pharadol-logo.jpeg",
    logoClassName: "h-28 w-28 -ml-4 rounded-full object-cover",
    address: "988, 1 ถ.มิตรภาพ ต.ในเมือง อ.เมืองนครราชสีมา จ.นครราชสีมา 30000",
    email: "pharadol.production@gmail.com",
    phone: "0910649380",
    headerAlignClassName: "items-center",
    titleClassName: "text-xl",
    contactClassName: "text-[8px]",
  },
  adisorn: {
    name: "ADISORN WEDDING STUDIO",
    eyebrow: "",
    logo: "/logo.png",
    logoClassName: "h-24 w-24 rounded-full object-cover",
    address: "55/27 ต.ในเมือง อ.เมืองนครราชสีมา จ.นครราชสีมา 30000",
    email: "adisornweddingstudio@gmail.com",
    phone: "089 354 4429",
    headerAlignClassName: "items-start",
    titleClassName: "text-2xl",
    contactClassName: "text-[10px]",
  },
};

export const getBrandDocument = (brandId) =>
  BRAND_DOCUMENTS[brandId] || BRAND_DOCUMENTS.pharadol;
