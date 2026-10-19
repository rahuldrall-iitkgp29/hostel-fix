import type { Metadata } from "next";
import { AccountEntry } from "@/features/auth/components/account-entry";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };
export default function LoginPage() { return <AccountEntry mode="login" />; }
