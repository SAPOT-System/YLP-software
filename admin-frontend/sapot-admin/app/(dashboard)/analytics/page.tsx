'use client';


export default function Analytics() {
	async function refresh() {
		console.log("clicked!")
		const data = await fetch("/api/auth/refresh", {method: "POST"})
		const newdata = await data.json();
		console.log(newdata);
	}
  return (
		<>
		<button onClick={()=>refresh()}>clickme</button>
		<p>Hi world, from analytics?</p>
		</>
  );
}
