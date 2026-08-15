import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ImportWizard } from "@/components/import/import-wizard";
import { Panel } from "@/components/mm-ui";
import {
  getAccounts,
  getCategories,
  getImportProfiles,
  getImportRules,
  getImportSources,
} from "@/data/repository";
import { takePendingImportFile } from "@/lib/import";

type WizardSearch = { sourceId?: string };

export const Route = createFileRoute("/imports/new")({
  validateSearch: (search: Record<string, unknown>): WizardSearch => {
    const sourceId = typeof search["sourceId"] === "string" ? search["sourceId"] : undefined;
    return sourceId ? { sourceId } : {};
  },
  loaderDeps: ({ search }) => ({ sourceId: search.sourceId }),
  loader: async ({ deps }) => {
    const [accounts, sources, profiles, categories, rules] = await Promise.all([
      getAccounts(),
      getImportSources(),
      getImportProfiles(),
      getCategories(),
      getImportRules(),
    ]);
    return { accounts, sources, profiles, categories, rules, sourceId: deps.sourceId };
  },
  head: () => ({
    meta: [
      { title: "New import — Money Pal" },
      { name: "description", content: "Drop a statement. We detect the bank and map columns." },
    ],
  }),
  pendingComponent: () => (
    <AppShell title="New import" subtitle="Loading…" signature="imports">
      <Panel>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Panel>
    </AppShell>
  ),
  component: NewImportPage,
});

function NewImportPage() {
  const { accounts, sources, profiles, categories, rules, sourceId } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const pending = takePendingImportFile();

  return (
    <AppShell
      title="New import"
      subtitle="Drop a statement. We detect the bank and map columns."
      signature="imports"
      actions={
        <Link
          to="/imports"
          className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Import Center
        </Link>
      }
    >
      <Panel>
        <ImportWizard
          accounts={accounts}
          sources={sources}
          profiles={profiles}
          categories={categories}
          rules={rules}
          sourceId={sourceId}
          initialFile={pending}
          onStaged={async (result) => {
            await router.invalidate();
            if (result.rows_done >= result.rows_total) {
              toast.success("Nothing new to review", {
                description: `${result.duplicates} duplicate rows skipped.`,
              });
              await navigate({ to: "/imports" });
              return;
            }
            await navigate({ to: "/imports/$jobId", params: { jobId: result.job_id } });
          }}
        />
      </Panel>
    </AppShell>
  );
}
