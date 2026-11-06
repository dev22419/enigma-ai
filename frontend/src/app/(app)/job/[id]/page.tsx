// AI-assisted: Used Claude to write this file.
import { Suspense } from "react";

import { JobView } from "@/components/app/job-view";

export const metadata = { title: "Job · Enigma" };

async function Job({ params }: { params: PageProps<"/job/[id]">["params"] }) {
  const { id } = await params;
  return <JobView id={id} />;
}

export default function JobPage({ params }: PageProps<"/job/[id]">) {
  return (
    <Suspense fallback={<div className="p-12 font-mono text-[12px] text-frost-soft">Opening job…</div>}>
      <Job params={params} />
    </Suspense>
  );
}
