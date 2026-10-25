'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowRight, CircleAlert, KeyRound } from 'lucide-react';
import { TextField } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import { useAuth } from '../context/auth-context';
import { changePasswordSchema, type ChangePasswordFormData } from '../schemas';
import { changePassword } from '@/lib/api/user';
import { ApiError } from '@/lib/api/errors';

export function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const { apiClient, logout } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    setServerError(null);
    try {
      await changePassword(apiClient, data);
      toast.success('Password changed successfully', {
        description: 'Please sign in with your new password.',
      });
      reset();
      if (onSuccess) {
        onSuccess();
      } else {
        await logout();
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.fields && err.fields.length > 0) {
          for (const field of err.fields) {
            const path = field.path as keyof ChangePasswordFormData;
            if (path) {
              setError(path, { message: field.message });
            }
          }
        }
        setServerError(err.message);
      } else {
        setServerError(
          'Failed to change password. Please check your connection and try again.'
        );
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>{serverError}</p>
        </div>
      )}

      <TextField
        id="current-password"
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        disabled={isSubmitting}
        {...register('currentPassword')}
      />

      <TextField
        id="new-password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="Must be at least 12 characters and different from your current password"
        error={errors.newPassword?.message}
        disabled={isSubmitting}
        {...register('newPassword')}
      />

      <TextField
        id="confirm-password"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        disabled={isSubmitting}
        {...register('confirmPassword')}
      />

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
        className="w-full justify-center text-base"
      >
        <KeyRound className="size-4" aria-hidden="true" />
        Update password <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
