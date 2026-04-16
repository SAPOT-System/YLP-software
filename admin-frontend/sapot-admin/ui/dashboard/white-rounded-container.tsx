import clsx from "clsx"
import { React } from "next/dist/server/route-modules/app-page/vendored/rsc/entrypoints"

export default function  WhiteContainer({
	children,
	style
}: Readonly<{
	children: React.ReactNode,
	style: string
}>) {
return  (
		<div className={clsx(`flex w-full gap-2 items-center custom-white p-2 rounded-3xl border-gray-200 shadow-md`, style) }>
			{children}
		</div>
)
}
