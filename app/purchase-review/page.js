import Review from "@/app/components/purchase/PurchaseReview";

export const metadata = {
  title: "อนุมัติจัดซื้อออนไลน์",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Page() {
  return <Review />;
}
