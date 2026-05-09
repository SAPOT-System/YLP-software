import React, { useState, useEffect } from 'react';
import { XIcon } from 'lucide-react'; // Or your icon library
import { toast } from 'sonner';
import Modal from './modal';

const inputStyle = "w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-700 bg-gray-50 focus:bg-white";
const labelStyle = "block text-sm font-semibold text-gray-700 mb-1 ml-1";

export default function EditUserModal({ user, isOpen, onClose, onRefresh, mode="edit" }) {
    const [editData, setEditData] = useState({
			id:  "",
        username: "",
        first_name: "",
        last_name: "",
        phone_number: "",
        email: "",
        password: "", // Optional for edit
        is_admin: false,
        is_rescuer: false
    });
    const [errors, setErrors] = useState({});

    // Sync user prop to state when modal opens or user changes
  useEffect(() => {
    if (mode === "edit" && user) {
      setEditData({
        id: user.id || "",
        username: user.username || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone_number: user.phone_number || "",
        email: user.email || "",
        password: "",
        is_admin: user.is_admin || false,
        is_rescuer: user.is_rescuer || false,
      });
    }

    if (mode === "create") {
      setEditData({
        id: "",
        username: "",
        first_name: "",
        last_name: "",
        phone_number: "",
        email: "",
        password: "",
        is_admin: false,
        is_rescuer: false,
      });
    }
  }, [user, isOpen, mode]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setEditData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanedData = Object.fromEntries(
      Object.entries(editData).filter(([_, v]) => v !== "")
    );

    try {
      const endpoint =
        mode === "edit"
          ? "/api/edit/user"
          : "/api/create/user/";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedData),
      });

      const result = await res.json();

      if (res.ok) {
        toast.success(
          mode === "edit"
            ? "User updated successfully"
            : "User created successfully"
        );

        onRefresh();
        onClose();
      } else {
        setErrors(result.error || {});
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "Request failed"
        );
      }
    } catch (err) {
      toast.error("Network error occurred");
    }
  };;

    if (!isOpen) return null;

    return (
			<Modal>
                <div className="flex justify-between items-center mb-6">

		  <div className="font-bold text-2xl text-gray-800">
		    {mode === "edit" ? (
		      <>
			  Edit User:{" "}
			<span className="text-blue-600">{user?.username}</span>
		      </>
		    ) : (
		      "Create New User"
		    )}
		  </div>
                  <XIcon className="w-6 h-6 cursor-pointer text-gray-400 hover:text-gray-600" onClick={()=>onClose(false)} />
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Username */}
                    <div>
                        <label className={labelStyle}>Username</label>
                        <input
                            type="text"
                            name="username"
                            value={editData.username}
                            onChange={handleChange}
                            className={inputStyle}
                            required
                        />
                        {errors.username && <div className="text-xs text-red-500 mt-1">{errors.username}</div>}
                    </div>

                    {/* First & Last Name Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelStyle}>First Name</label>
                            <input
                                type="text"
                                name="first_name"
                                value={editData.first_name}
                                onChange={handleChange}
                                className={inputStyle}
                                required
                            />
                        </div>
                        <div>
                            <label className={labelStyle}>Last Name</label>
                            <input
                                type="text"
                                name="last_name"
                                value={editData.last_name}
                                onChange={handleChange}
                                className={inputStyle}
                                required
                            />
                        </div>
                    </div>

                    {/* Contact Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelStyle}>Phone Number</label>
                            <input
                                type="tel"
                                name="phone_number"
                                value={editData.phone_number}
                                onChange={handleChange}
                                pattern="^\+?1?\d{9,15}$"
                                className={inputStyle}
                            />
                        </div>
                        <div>
                            <label className={labelStyle}>Email Address</label>
                            <input
                                type="email"
                                name="email"
                                value={editData.email}
                                onChange={handleChange}
                                className={inputStyle}
                            />
                        </div>
                    </div>

                    {/* Password (Optional) */}
                    <div>
		      <label className={labelStyle}>
			{mode === "edit"
			  ? "New Password (Leave blank to keep current)"
			  : "Password"}
		      </label>
                        <input
                          type="password"
                          name="password"
                          value={editData.password}
                          onChange={handleChange}
                          placeholder="••••••••"
                          className={inputStyle}
                          pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$"
			  required={mode === "create"}
                        />
                    </div>

                    {/* Roles */}
                    <div className="flex flex-col gap-3 py-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="is_admin"
                                checked={editData.is_admin}
                                onChange={handleChange}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600"
                            />
                            <span className="text-gray-700 font-medium">Administrator Access</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="is_rescuer"
                                checked={editData.is_rescuer}
                                onChange={handleChange}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600"
                            />
                            <span className="text-gray-700 font-medium">Authorized Rescuer</span>
                        </label>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-lg shadow-blue-100"
                        >
			  {mode === "edit"
			    ? "Update User Account"
			    : "Create User Account"}

                        </button>
                    </div>
                </form>
						</Modal>
    );
}
