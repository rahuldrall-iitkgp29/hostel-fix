'use client';

import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useAuth } from '@/features/auth/context/auth-context';
import { AppShell } from '@/components/layout/app-shell';
import { ProfileView } from '@/features/profile/components/profile-view';

function ProfileContent() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        roomLabel: user.roomId ?? undefined,
      }}
      onLogout={logout}
    >
      <ProfileView />
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
