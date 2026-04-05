import React from 'react';
import { Pencil, Trash2, Ban } from 'lucide-react';

export interface UserData {
  id: number;
  username: string;
  email: string;
  phone: string;
  status: 'Active' | 'Inactive';
  lastActive: string;
}

export interface UserTableProps {
  data: UserData[];
}

const UserTable: React.FC<UserTableProps> = ({ data }) => {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-left border-collapse">
        {/* Table Header */}
        <thead>
          <tr className="custom-gray text-black text-sm font-semibold">
            <th className="px-6 py-4">ID</th>
            <th className="px-6 py-4">Username</th>
            <th className="px-6 py-4">Email</th>
            <th className="px-6 py-4">Phone</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Last Active</th>
            <th className="px-6 py-4 text-center">Action</th>
          </tr>
        </thead>

        {/* Table Body */}
        <tbody className="divide-y divide-gray-100">
          {data.map((user) => (
            <tr key={user.id} className="hover:bg-gray-50 custom-white transition-colors">
              <td className="px-6 py-5 text-gray-700 text-sm">{user.id}</td>
              <td className="px-6 py-5 text-gray-700 text-sm font-medium">
                {user.username}
              </td>
              <td className="px-6 py-5 text-gray-600 text-sm lowercase">
                {user.email}
              </td>
              <td className="px-6 py-5 text-gray-600 text-sm">{user.phone}</td>
              <td className="px-6 py-5 text-sm">
                <span className={user.status === 'Active' ? 'text-gray-700' : 'text-gray-500'}>
                  {user.status}
                </span>
              </td>
              <td className="px-6 py-5 text-gray-600 text-sm">
                {user.lastActive}
              </td>
              <td className="px-6 py-5">
                <div className="flex items-center justify-center gap-4">
                  <button className="text-gray-500 hover:text-gray-800 transition-colors">
                    <Pencil size={20} />
                  </button>
                  <button className="text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 size={20} />
                  </button>
                  <button className="text-red-400 hover:text-red-600 transition-colors">
                    <Ban size={20} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserTable;
