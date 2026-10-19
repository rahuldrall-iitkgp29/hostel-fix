import type { Metadata } from "next";
import { AccountEntry } from "@/features/auth/components/account-entry";

export const metadata: Metadata = { title: "Student registration", robots: { index: false, follow: false } };
export default function RegisterPage() { return <AccountEntry mode="register" />; }
