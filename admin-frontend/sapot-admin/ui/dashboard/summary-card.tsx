export default function SummaryCard(
	{ 
		label,
		value,
	}: {
		label: string,
		value: string
	}
){
	return (
		<div className="flex w-full flex-col gap-2 py-3 px-2 rounded-2xl shadow-sm border border-black/10">
			<div className="text-lg font-bold">{label}</div>
			<div className="text-3xl font-bold">{value}</div>
		</div>
	)

}
