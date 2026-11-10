"use client";
import { useState } from "react";
import { AssetChart } from "./market-desk";
import { AssetResearch } from "./asset-research";
import type { Timeframe } from "@/domain/market";
import { AssetContext } from "./asset-context";
export function AssetWorkspace({ asset }: { asset: string }) {
  const [tf, setTf] = useState<Timeframe>("4h");
  return (
    <>
      <AssetChart asset={asset} onTimeframe={setTf} />
      <AssetResearch asset={asset} timeframe={tf} />
      <AssetContext asset={asset} />
    </>
  );
}
