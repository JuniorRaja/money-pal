import { Outlet, createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-guard";

export const Route = createFileRoute("/imports")({
  beforeLoad: requireAuth,
  component: () => <Outlet />,
});
