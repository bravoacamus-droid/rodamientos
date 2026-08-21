import { Skeleton, SkeletonTable } from "./primitives";

export function LoadingPagina({
  filas = 10,
  columnas = 7,
  conKpis = true,
  conFiltros = true,
}: {
  filas?: number;
  columnas?: number;
  conKpis?: boolean;
  conFiltros?: boolean;
}) {
  return (
    <>
      <div className="border-b bg-[var(--surface)] px-4 pb-4 pt-5 sm:px-6">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 h-3 w-[26rem] max-w-full" />
        {conFiltros && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Skeleton className="h-9 w-full max-w-sm rounded-md" />
            <Skeleton className="h-9 w-40 rounded-md" />
            <Skeleton className="h-9 w-40 rounded-md" />
          </div>
        )}
      </div>
      <div className="space-y-4 px-4 py-5 sm:px-6">
        {conKpis && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card elev-1 flex items-center gap-3 p-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="mt-1.5 h-2 w-24" />
                </div>
              </div>
            ))}
          </div>
        )}
        <SkeletonTable rows={filas} cols={columnas} />
      </div>
    </>
  );
}
