'use client'
import UserTable from "@/ui/dashboard/user-table";
import { useState, useEffect } from 'react';
import { toast } from "sonner";
import { getTime } from "../dashboard/page";
import MetricSkeleton from "@/ui/dashboard/skeleton";
import { LoaderIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import Modal from "@/ui/dashboard/modal";

export default function Users() {
	const [userActivityData, setUserActivityData] = useState({});
	const [page, setPage] = useState(1);
	const [isMounted, setIsMounted] = useState(false);
	const [keyword, setKeyword] = useState("");
	const [isSearching, setIsSearching] = useState(false);
	const [userCreateError, setUserCreateError] = useState({});
	const [isOpenCreateUser, setIsOpenCreateUser] = useState(false);
	const [createUserData, setCreateUserData] = useState({
		"username": "",
		"first_name": "",
		"last_name": "",
		"phone_number": "",
		"email": "",
		"password": "",
		"is_admin": false,
		"is_rescuer": false
	})
	const defaultCreateUser = {
		"username": "",
		"first_name": "",
		"last_name": "",
		"phone_number": "",
		"email": "",
		"password": "",
		"is_admin": false,
		"is_rescuer": false
	}
	const size = 5;

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setCreateUserData((prev) => ({
			...prev,
			// If it's a checkbox, use 'checked', otherwise use 'value'
			[name]: type === 'checkbox' ? checked : value
		}));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		try {
			const cleanedData = Object.fromEntries(
				Object.entries(createUserData).filter(([_, value]) => value !== "")
			);
			const response = await fetch('/api/create/user', { // Check this path!
				method: "POST",
				// Make sure this variable name matches your useState name!
				body: JSON.stringify(cleanedData), 
				headers: {
					'Content-Type': 'application/json',
				},
			});

			// Parse the JSON immediately so we can read the error details
			const result = await response.json();

			if (response.ok) {
				toast.success("User created successfully");
				setCreateUserData(defaultCreateUser);
				// Optional: clear form or redirect here
			} else {
				// result.error comes from the 'NextResponse' we wrote in the last step
				console.error("Backend Error:", result.error);
				setUserCreateError(result.error)
				throw new Error("Please revalidate all the fields");
			}
		} catch (error) {
			toast.error("Error creating user");
			console.log("Catch Error:", error);
		}
	};

	const inputStyle = "w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-700 bg-gray-50 focus:bg-white";
	const labelStyle = "block text-sm font-semibold text-gray-700 mb-1 ml-1";

	useEffect(()=> {
		(async ()=>{
			try {
				const url = `/api/get-users-activity?keyword=${keyword}&page=${page}&size=${size}`;
				const fetchUserActivity = await fetch(url); 
				console.log("URL", fetchUserActivity)
				const userData = await fetchUserActivity.json();
				if (userData.error) 
					throw Error("Failed to fetch user activity");
				setIsMounted(true);
				setUserActivityData(userData)
				setIsMounted(true);
				setIsSearching(false)
			} catch {
				toast.error("Failed to fetch user activity data.")
				setIsMounted(false);
			}
		})()
		console.log("KEYWORD", keyword)
	}, [page, keyword])

	useEffect(()=> {
		setIsSearching(true);
	}, [keyword])

	if (!isMounted || !userActivityData ) {
		return <div className="flex flex-row items-stretch gap-6 p-10">
	       <MetricSkeleton />
	     </div>
	 }
	 console.log(userActivityData)
	return ( 
					<div className="flex flex-col gap-2">

					{isOpenCreateUser && <Modal>
						<div className="flex justify-between">
							<div className="font-bold text-lg">Create User</div>
							<XIcon className="w-5 cursor-pointer" onClick={()=>setIsOpenCreateUser(false)}/>
						</div>
						<div>
						<form onSubmit={handleSubmit} className="space-y-5">
							{/* Username */}
							<div>
								<label className={labelStyle}>Username</label>
								<input
									type="text"
									name="username"
									value={createUserData.username}
									onChange={handleChange}
									placeholder="johndoe123"
									className={inputStyle}
									required
									/>
								{ userCreateError?.username && <div className="text-xs text-red-500">{userCreateError.username}</div> }
							</div>

							{/* First & Last Name Grid */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
							<label className={labelStyle}>First Name</label>
							<input
							type="text"
							name="first_name"
							value={createUserData.first_name}
							onChange={handleChange}
							placeholder="John"
							className={inputStyle}
							min={2}
							max={50}
							required
							/>
							</div>
							<div>
							<label className={labelStyle}>Last Name</label>
							<input
							type="text"
							name="last_name"
							value={createUserData.last_name}
							onChange={handleChange}
							placeholder="Doe"
							min={2}
							max={50}
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
							value={createUserData.phone_number}
							onChange={handleChange}
							placeholder="+1 (555) 000-0000"
							className={inputStyle}
							pattern="^\+?1?\d{9,15}$"
							title="+639165454534"
							/>
							{ userCreateError?.phone_number && <div className="text-xs text-red-500">{userCreateError.phone_number}</div> }
							</div>
							<div>
							<label className={labelStyle}>Email Address</label>
							<input
							type="email"
							name="email"
							value={createUserData.email}
							onChange={handleChange}
							placeholder="john@example.com"
							className={inputStyle}
							/>
							{ userCreateError?.email && <div className="text-xs text-red-500">{userCreateError.email}</div> }
							</div>
							</div>

							{/* Password */}
							<div>
							<label className={labelStyle}>Password</label>
							<input
							type="password"
							name="password"
							value={createUserData.password}
							onChange={handleChange}
							placeholder="••••••••"
							className={inputStyle}
							pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$"
							title="Password must be 8–128 characters long and include at least one uppercase letter, one lowercase letter, and one number."
							required
							/>
							{ userCreateError?.password && <div className="text-xs text-red-500">{userCreateError.password}</div> }
							</div>

							{/* Roles (Checkboxes) */}
							<div className="flex flex-col gap-3 py-2">
							<label className="flex items-center gap-3 cursor-pointer group">
							<div className="relative flex items-center">
							<input
							type="checkbox"
							name="is_admin"
							checked={createUserData.is_admin}
							onChange={handleChange}
							className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
							/>
							</div>
							<span className="text-gray-700 font-medium select-none">Administrator Access</span>
							</label>

							<label className="flex items-center gap-3 cursor-pointer group">
							<div className="relative flex items-center">
							<input
							type="checkbox"
							name="is_rescuer"
							checked={createUserData.is_rescuer}
							onChange={handleChange}
							className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
							/>
							</div>
							<span className="text-gray-700 font-medium select-none">Authorized Rescuer</span>
							</label>
							</div>

							{/* Submit Button */}
							<div className="pt-4">
							<button
							type="submit"
							className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-lg shadow-blue-100"
							>
							Create User Account
							</button>
							</div>
						</form>
						</div>
						</Modal> }
							<div className="grid grid-cols-5 gap-2">
								<div className="custom-gray col-span-4 flex items-center gap-1 h-12 p-5 rounded-3xl">
								{
									isSearching ? <LoaderIcon className="w-5"/> : <SearchIcon className="w-5"/>
								}
										<input onChange={(e)=>setKeyword(e.target.value)} className="w-full outline-none focus:border-none "/>
								</div>
								<div key="view-nodes" className="flex gap-1 items-center justify-center text-white cursor-pointer bg-blue-600 hover:bg-blue-500 transition-all duration-150 rounded-3xl px-1 py-1 text-center" onClick={()=>setIsOpenCreateUser(true)}>
								<PlusIcon/>{ "Add user" }
								</div>
						</div>
						<UserTable 
											data={userActivityData.items || []} 
											onPageChange={(newPage) => setPage(newPage)}
											currentPage={userActivityData.page} 
											totalPages={userActivityData.pages}
										/>
					</div>
  );
}
