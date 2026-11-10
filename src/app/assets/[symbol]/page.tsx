import { notFound } from "next/navigation";
import { assetSchema } from "@/domain/market";
import { AssetWorkspace } from "@/components/asset-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  if (!assetSchema.safeParse(symbol).success) notFound();
  return (
    <>
      <AssetWorkspace asset={symbol} />
    </>
  );
}
