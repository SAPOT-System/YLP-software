import clsx from 'clsx';
import React from 'react';

// Inside your NetworkTable.jsx
const NetworkTable = ({ data, columns, className }) => { // 1. Catch className here
  return (
    /* 2. Inject it into the outer container */
    <div className={`w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-white font-sans ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead className="bg-[#E9E9E9]">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-6 py-4 text-sm font-semibold text-gray-700">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row, index) => (
            <tr key={index} className="hover:bg-gray-50 transition-colors">
              {columns.map((col) => (
                <td key={col} className="px-6 py-5 text-sm text-gray-600">
                  {col === "Status" ? (
                    <span className={row[col] === "Active" ? "text-green-600 font-medium" : "text-gray-400"}>
                      {row[col]}
                    </span>
                  ) : (
                    row[col]
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default NetworkTable;
