import { redirect } from "next/navigation";

export default function StaffDashboard() { redirect("/login?returnTo=%2Fstaff%2Fdashboard"); }
