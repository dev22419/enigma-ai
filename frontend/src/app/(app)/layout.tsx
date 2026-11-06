// AI-assisted: Used Claude to write this file.
import { AppShell } from "@/components/app/app-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
