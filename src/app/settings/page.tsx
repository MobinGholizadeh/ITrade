import { SettingsForm } from "@/components/settings-form";
import { SettingsTelemetry } from "@/components/settings-telemetry";
export const metadata = { title: "Settings" };
export default function SettingsPage() {
  return (
    <>
      <SettingsForm />
      <SettingsTelemetry />
    </>
  );
}
