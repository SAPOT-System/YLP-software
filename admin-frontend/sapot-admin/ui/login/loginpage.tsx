import Image from 'next/image';

export default function LoginPage() {
  return (
    <main className="relative min-h-screen w-full flex flex-col  p-4">
      {/* 1. Background Image Layer */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/backgrounds/login.png" // Replace with your actual image path
          alt="Background"
          fill
          priority
          className="object-cover"
        />
				{/* THE WHITE GRADIENT (The part you want) */}
				<div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
        {/* Dark overlay to match the image's mood and improve contrast */}
        <div className="absolute inset-0 bg-black/15" />
      </div>

      {/* 2. Top-Left Logo (SAPOT) */}
      <div className="block cursor-pointer top-8 left-8 flex py-4 items-center gap-2 text-white font-bold text-xl">
        <Image
          src="/logos/logo.png" // Replace with your actual image path
          alt="Background"
					width={32}
					height={32}
          className=""
        />
        <span className='font-custom-color'>SAPOT</span>
      </div>

      {/* 3. The Login Card */}
      <div className='w-full flex justify-center items-center'>
			<div className="w-full max-auto max-w-[400px] bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center">
        <h1 className="text-2xl font-bold font-custom-color mb-1">Welcome Admin!</h1>
        <p className="text-gray-400 text-xs mb-8">Please login to continue</p>

        <form className="w-full space-y-5">
          <div className="space-y-1">
            <label className="text-sm font-semibold font-custom-color">Username</label>
            <input 
              type="text" 
              placeholder="Username"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold font-custom-color">Password</label>
            <input 
              type="password" 
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <div className="text-right">
              <a href="#" className="text-[10px] font-custom-color hover:underline">Forgot password?</a>
            </div>
          </div>

          <button className="w-full bg-[#4481eb] text-white py-3 rounded-full font-semibold shadow-lg hover:bg-blue-600 transition-colors mt-4">
            Login
          </button>
        </form>

        <p className="mt-6 text-[10px] text-gray-500">
          Don't have an account? <a href="#" className="font-custom-color hover:underline">Register here</a>
        </p>
      </div></div>
    </main>
  );
}
