import clsx from "clsx";

type Column<T> = {
  header: string;
  key: keyof T;
  className?: string;
  render?: (value: any, row: T) => React.ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  data: T[];

  // pagination
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;

  className?: string;
  emptyMessage?: string;
  isLoading?: boolean;
};

export default function ReusableTable<T>({
  columns,
  data,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  className,
  emptyMessage = "No data available",
  isLoading = false,
}: Props<T>) {
  return (
    <div className={clsx("w-full rounded-xl border border-gray-200 shadow-sm font-sans bg-white", className)}>

      {/* TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">

          {/* HEADER */}
          <thead className="bg-[#E9E9E9]">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-6 py-4 text-sm font-semibold text-gray-700"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          {/* BODY */}
          <tbody className="divide-y divide-gray-100">

            {/* LOADING */}
            {isLoading && (
              <tr>
                <td colSpan={columns.length} className="text-center py-10 text-gray-400">
                  Loading...
                </td>
              </tr>
            )}

            {/* EMPTY */}
            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center py-10 text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}

            {/* DATA */}
            {!isLoading && data.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                {columns.map((col, colIndex) => {
                  const value = row[col.key];

                  return (
                    <td
                      key={colIndex}
                      className={clsx("px-6 py-5 text-sm text-gray-600", col.className)}
                    >
                      {col.render
                        ? col.render(value, row)
                        : value ?? "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">

          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>

          <div className="flex gap-2">

            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40"
            >
              Prev
            </button>

            {/* Page Numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(Math.max(0, currentPage - 3), currentPage + 2)
              .map((page) => (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  className={clsx(
                    "px-3 py-1 rounded-lg text-sm",
                    page === currentPage
                      ? "bg-blue-600 text-white"
                      : "border"
                  )}
                >
                  {page}
                </button>
              ))}

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40"
            >
              Next
            </button>

          </div>
        </div>
      )}
    </div>
  );
}
