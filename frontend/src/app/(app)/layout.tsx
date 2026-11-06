// AI-assisted: Used Claude to write this file.
import { AppShell } from "@/components/app/app-shell";
import { Providers } from "@/components/app/providers";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
