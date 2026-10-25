'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Building,
  Shield,
  KeyRound,
  CircleAlert,
  Save,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/features/auth/context/auth-context';
import { profileSchema, type ProfileFormData } from '@/features/auth/schemas';
import { updateProfile, getMe } from '@/lib/api/user';
import { ApiError } from '@/lib/api/errors';
import { TextField } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChangePasswordForm } from '@/features/auth/components/change-password-form';
import { PageHeader } from '@/components/layout/page-header';

export function ProfileView() {
  const { user, updateUser, apiClient } = useAuth();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: {
      expectedVersion: user?.version ?? 1,
      name: user?.name ?? '',
      phone: user?.phone ?? '',
    },
  });

  if (!user) return null;

  const onProfileSubmit = async (data: ProfileFormData) => {
    setProfileError(null);
    try {
      const response = await updateProfile(apiClient, {
        expectedVersion: user.version,
        name: data.name,
        phone: data.phone || null,
      });
      updateUser(response.user);
      reset({
        expectedVersion: response.user.version,
        name: response.user.name,
        phone: response.user.phone ?? '',
      });
      toast.success('Profile updated successfully');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409 || err.code === 'VERSION_CONFLICT') {
          setProfileError(
            'Your profile was modified in another session. We have reloaded the latest profile data. Please review and reapply your changes.'
          );
          // Refetch latest state
          try {
            const latest = await getMe(apiClient);
            updateUser(latest.user);
            reset({
              expectedVersion: latest.user.version,
              name: latest.user.name,
              phone: latest.user.phone ?? '',
            });
          } catch {
            // ignore refetch failure
          }
          return;
        }

        if (err.fields && err.fields.length > 0) {
          for (const field of err.fields) {
            const path = field.path as keyof ProfileFormData;
            if (path) {
              setError(path, { message: field.message });
            }
          }
        }
        setProfileError(err.message);
      } else {
        setProfileError(
          'Failed to update profile. Please check your connection.'
        );
      }
    }
  };

  const roleTones: Record<string, 'neutral' | 'success' | 'warning'> = {
    STUDENT: 'neutral',
    STAFF: 'warning',
    ADMIN: 'success',
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Account management"
        title="Your Profile"
        description="Manage your contact details and account security. Role and hostel allocations are managed by your hostel office."
        badge={<Badge tone={roleTones[user.role]}>{user.role}</Badge>}
        breadcrumbs={[
          { label: 'Dashboard', href: `/${user.role.toLowerCase()}/dashboard` },
          { label: 'Profile' },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: Account Metadata */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Account details
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <User className="mt-0.5 size-4 text-brand shrink-0" />
                <div>
                  <p className="text-xs text-muted">Full Name</p>
                  <p className="font-medium text-ink">{user.name}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 size-4 text-brand shrink-0" />
                <div>
                  <p className="text-xs text-muted">Hostel Email</p>
                  <p className="font-medium text-ink break-all">{user.email}</p>
                  <span className="text-[11px] text-muted">
                    Tied to institutional ID
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Shield className="mt-0.5 size-4 text-brand shrink-0" />
                <div>
                  <p className="text-xs text-muted">Account Role</p>
                  <p className="font-medium text-ink">{user.role}</p>
                </div>
              </div>

              {user.role === 'STUDENT' && (
                <div className="flex items-start gap-2.5">
                  <Building className="mt-0.5 size-4 text-brand shrink-0" />
                  <div>
                    <p className="text-xs text-muted">Room Allocation</p>
                    <p className="font-medium text-ink">
                      {user.roomId ? `Room ${user.roomId}` : 'Allocated'}
                    </p>
                  </div>
                </div>
              )}

              {user.createdAt && (
                <div className="flex items-start gap-2.5 border-t border-line pt-3">
                  <Clock className="mt-0.5 size-4 text-muted shrink-0" />
                  <div>
                    <p className="text-xs text-muted">Member since</p>
                    <p className="text-xs text-muted">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4 bg-brand-soft/40 border-brand/20">
            <p className="text-xs text-brand font-medium">
              HostelFix P0 Operations
            </p>
            <p className="mt-1 text-xs text-muted">
              Role changes, hostel reassignment, and room transfers must be
              requested directly from your warden.
            </p>
          </Card>
        </div>

        {/* Right Column: Edit Profile & Password Form */}
        <div className="space-y-8 lg:col-span-2">
          {/* Edit Name & Phone */}
          <Card className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                Contact information
              </h2>
              <p className="text-sm text-muted">
                Update your display name and contact phone number.
              </p>
            </div>

            {profileError && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"
              >
                <CircleAlert
                  className="mt-0.5 size-5 shrink-0"
                  aria-hidden="true"
                />
                <p>{profileError}</p>
              </div>
            )}

            <form
              onSubmit={handleSubmit(onProfileSubmit)}
              className="space-y-5"
              noValidate
            >
              <TextField
                id="profile-name"
                label="Full name"
                autoComplete="name"
                error={errors.name?.message}
                disabled={isSubmitting}
                {...register('name')}
              />

              <TextField
                id="profile-phone"
                label="Phone number"
                type="tel"
                autoComplete="tel"
                placeholder="+919876543210"
                hint="Used by maintenance staff if they need to reach you regarding a repair"
                error={errors.phone?.message}
                disabled={isSubmitting}
                {...register('phone')}
              />

              <div className="flex items-center justify-between border-t border-line pt-4">
                <span className="text-xs text-muted">
                  Version {user.version}
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  disabled={!isDirty}
                >
                  <Save className="size-4" aria-hidden="true" /> Save changes
                </Button>
              </div>
            </form>
          </Card>

          {/* Password Section */}
          <Card className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  Password & Security
                </h2>
                <p className="text-sm text-muted">
                  Change your password to keep your account secure.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
                className="text-xs"
              >
                <KeyRound className="size-3.5" />
                {showPasswordSection ? 'Hide form' : 'Change password'}
              </Button>
            </div>

            {showPasswordSection && (
              <div className="border-t border-line pt-6">
                <ChangePasswordForm
                  onSuccess={() => {
                    setShowPasswordSection(false);
                  }}
                />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
