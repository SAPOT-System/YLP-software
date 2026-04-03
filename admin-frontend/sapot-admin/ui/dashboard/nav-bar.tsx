import Image from 'next/image';
import Link from 'next/link';

export default function NavBar() {
	const iconSize = 36;
	const logoSize = 42;
	return (
		<div className='w-full px-4 py-2 flex justify-between shadow-lg'>
			<Link href="#" className="block cursor-pointer top-8 left-8 flex py-4 items-center gap-2 text-white font-bold text-xl">
					<Image
						src="/logos/logo.png" // Replace with your actual image path
						alt="SAPOT logo"
						width={logoSize}
						height={logoSize}
						className=""
					/>
					<span className='font-custom-color'>SAPOT</span>
			</Link>
			<div className="flex items-center justify-center gap-3">
				<Link href="#">
					<Image
						src="/icons/bell_icon.png" // Replace with your actual image path
						alt="bell icon"
						width={iconSize}
						height={iconSize}
						className=""
					/>
				</Link>

				<Link href="#">
					<Image
						src="/icons/profile_icon.png" // Replace with your actual image path
						alt="bell icon"
						width={iconSize}
						height={iconSize}
						className=""
					/>
				</Link>
			</div>
		</div>
	)

}
