import { redirect } from "next/navigation";

// No protected data is rendered before a real session lifecycle is integrated.
export default function StudentDashboard() { redirect("/login?returnTo=%2Fstudent%2Fdashboard"); }
