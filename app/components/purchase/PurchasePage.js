import { notFound } from "next/navigation";
import { uuidPattern } from "@/lib/purchase/data";
import PurchaseApprovers from "./PurchaseApprovers";
import PurchaseDetail from "./PurchaseDetail";
import PurchaseForm from "./PurchaseForm";
import PurchaseList from "./PurchaseList";

export default function PurchasePage({ brand, view = [] }) {
  const [resource, action, target] = view;
  if (!view.length) return <PurchaseList brand={brand} />;
  if (view.length === 1 && resource === "new") return <PurchaseForm brand={brand} />;
  if (view.length === 1 && resource === "approvers") return <PurchaseApprovers brand={brand} />;
  if (!uuidPattern.test(resource)) notFound();
  if (view.length === 1) return <PurchaseDetail brand={brand} requisitionId={resource} />;
  if (view.length === 2 && action === "edit") return <PurchaseForm brand={brand} requisitionId={resource} />;
  if (view.length === 3 && action === "round" && /^[1-9]\d{0,8}$/.test(target)) {
    return <PurchaseDetail brand={brand} requisitionId={resource} round={target} />;
  }
  notFound();
}
