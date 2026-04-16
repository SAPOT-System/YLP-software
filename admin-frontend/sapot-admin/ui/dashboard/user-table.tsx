import React, { useState } from 'react';
import { Pencil, Trash2, Ban, ChevronLeft, ChevronRight } from 'lucide-react'; // Added icons
import EditUserModal from './edit-user-modal';
import Modal from './modal';
import { toast } from 'sonner';
import { refresh } from 'next/cache';

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
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
	refreshData: () => void;
}

function formatDate(rawDate: string) {
  if (!rawDate || rawDate === "Never") return "Never";
  const cleanString = rawDate.endsWith('Z') ? rawDate : `${rawDate}Z`;
  try {
    const date = new Date(cleanString);
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  } catch {
    return rawDate;
  }
}

const UserTable: React.FC<UserTableProps> = ({ data, currentPage, totalPages, onPageChange, refreshData }) => {
	const [selectedUser, setSelectedUser] = useState(null);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);

	const handleEditClick = (user) => {
		setSelectedUser(user);
		setIsEditOpen(true);
		console.log("user", user)
	};

	const handleDeleteClick = async () => {
		if (!selectedUser?.id) {
			toast.error("Cannot delete user: None")
			return;
		}

		const fetchData = await fetch('api/delete/user', {
			method:"POST",
			body: JSON.stringify({user_id: selectedUser?.id}),
      headers: {
        'Content-Type': 'application/json',
      },
		})
		if (!fetchData.ok) {
			console.log(fetchData)
			toast.error("Cannot delete user: None")
			return 
		}
		toast.success("User successfully deleted.")
		refreshData()
		setIsDeleteOpen(false)
	};

	const openConfirmDelete = (user) => {
		setSelectedUser(user)
		setIsDeleteOpen(true);
	}

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-200 custom-white shadow-sm">
		{ isDeleteOpen && 
			<Modal style=''>
		<div className="flex flex-col gap-10">
			<div className="px-2 py-4">{ `This action will COMPLETELY DELETE USER '${selectedUser?.username}.' ` }</div> 
			<div className="grid grid-cols-3 gap-2">
				<div className="border border-black/30 hover:border-black/50 cursor-pointer bg-transparent transition-all duration-150 w-full rounded-3xl px-2 py-1 text-xl text-center font-medium col-span-1" onClick={()=>setIsDeleteOpen(false)}>Cancel</div>
				<div className="text-white bg-red-600 hover:bg-red-500 transition-all duration-150 cursor-pointer w-full rounded-3xl px-2 py-1 text-xl text-center font-medium col-span-2" onClick={()=>handleDeleteClick()}>Delete User</div>
			</div>
		</div>
			</Modal>
		}

		<EditUserModal 
			user={selectedUser} 
			isOpen={isEditOpen} 
			onClose={() => setIsEditOpen(false)}
			onRefresh={()=>{refreshData()}} // Your function to reload data
		/>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="custom-gray text-black text-sm font-semibold border-b border-gray-200">
            <th className="px-6 py-4">ID</th>
            <th className="px-6 py-4">Username</th>
            <th className="px-6 py-4">Email</th>
            <th className="px-6 py-4">Phone</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Last Active</th>
            <th className="px-6 py-4 text-center">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.length > 0 ? (
            data.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-5 text-gray-700 text-sm">{user.id}</td>
                <td className="px-6 py-5 text-gray-700 text-sm font-medium">{user.username}</td>
                <td className="px-6 py-5 text-gray-600 text-sm lowercase">{user.email}</td>
                <td className="px-6 py-5 text-gray-600 text-sm">{user.phone}</td>
                <td className="px-6 py-5 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-5 text-gray-600 text-sm">
                  {formatDate(user.lastActive)}
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center justify-center gap-4">
                    <button className="text-gray-500 hover:text-gray-800 transition-colors">
                      <Pencil onClick={() => handleEditClick(user)} size={18} />
                    </button>
                    <button className="text-red-400 hover:text-red-600 transition-colors">
                      <Trash2 onClick={()=>openConfirmDelete(user)} size={18} />
                    </button>
                    <button className="text-red-400 hover:text-red-600 transition-colors">
                      <Ban size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="px-6 py-10 text-center text-gray-400 text-sm">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
        <div className="text-sm text-gray-500">
          Page <span className="font-medium text-gray-700">{currentPage}</span> of <span className="font-medium text-gray-700">{totalPages}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
							console.log("currentPage", currentPage)
							onPageChange(currentPage - 1);
							console.log("currentPage after", currentPage);
						}}
            disabled={currentPage === 1}
            className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          
          <button
            onClick={() => {
							onPageChange(currentPage + 1)
							console.log("currentPage after", currentPage);
						}
						}
            disabled={currentPage >= totalPages}
            className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserTable;
