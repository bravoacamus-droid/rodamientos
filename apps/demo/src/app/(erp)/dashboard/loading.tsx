import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <>
      <div className="border-b bg-[var(--surface)] px-4 pb-4 pt-5 sm:px-6">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="mt-2 h-3 w-96" />
      </div>
      <div className="space-y-4 px-4 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card elev-1 p-4">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="mt-3 h-7 w-36" />
              <Skeleton className="mt-3 h-2.5 w-28" />
            </div>
          ))}
        </div>
        <div className="grid gap-3 xl:grid-cols-5">
          <Skeleton className="h-[340px] rounded-xl xl:col-span-3" />
          <Skeleton className="h-[340px] rounded-xl xl:col-span-2" />
        </div>
      </div>
    </>
  );
}
