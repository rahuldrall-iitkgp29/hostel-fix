import { redirect } from "next/navigation";

export default function AdminDashboard() { redirect("/login?returnTo=%2Fadmin%2Fdashboard"); }
