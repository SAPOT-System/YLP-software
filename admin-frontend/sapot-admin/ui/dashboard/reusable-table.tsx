import clsx from 'clsx';
import React from 'react';

const ReusableTable = ({ columns, data, className="" }: {columns: any; data: any; className?: string}) => {
  return (
    <div className={clsx("w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm font-sans", {className})}>
      <table className="w-full text-left border-collapse bg-white">
        {/* Table Header */}
        <thead className="bg-[#E9E9E9]">
          <tr>
            {columns.map((col, index) => (
              <th 
                key={index} 
                className="px-6 py-4 text-sm font-semibold text-gray-700 first:rounded-tl-xl last:rounded-tr-xl"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        
        {/* Table Body */}
        <tbody className="divide-y divide-gray-100">
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
              {columns.map((col, colIndex) => (
                <td key={colIndex} className="px-6 py-5 text-sm text-gray-600">
                  {/* Status column gets special treatment for colors */}
                  {col.key === 'status' ? (
                    <span className={row[col.key] === 'Active' ? 'text-green-600 font-medium' : 'text-gray-400'}>
                      {row[col.key]}
                    </span>
                  ) : (
                    row[col.key]
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

export default ReusableTable;
