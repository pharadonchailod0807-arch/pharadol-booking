import PurchasePage from "@/app/components/purchase/PurchasePage";

export const metadata = { title: "จัดซื้อและตั้งเบิก" };

export default async function Page({ params }) {
  const { view } = await params;
  return <PurchasePage brand="pharadol" view={view} />;
}
