'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { TextField } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import { useAuth } from '../context/auth-context';
import { loginSchema, type LoginFormData } from '../schemas';
import { getSafeReturnTo } from '../utils/return-to';
import { ApiError } from '@/lib/api/errors';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      const authData = await login(data);
      toast.success('Welcome back!', {
        description: `Signed in as ${authData.user.name}`,
      });

      if (authData.user.mustChangePassword) {
        router.push('/change-password');
        return;
      }

      const returnTo = getSafeReturnTo(
        searchParams?.get('returnTo'),
        authData.user.role
      );
      router.push(returnTo);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.fields && err.fields.length > 0) {
          for (const field of err.fields) {
            if (field.path === 'email' || field.path === 'password') {
              setError(field.path, { message: field.message });
            }
          }
        }
        setServerError(err.message);
      } else {
        setServerError(
          'Unable to sign in. Please check your connection and try again.'
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
        id="login-email"
        label="Hostel email"
        type="email"
        autoComplete="email"
        placeholder="student@hostel.edu"
        error={errors.email?.message}
        disabled={isSubmitting}
        {...register('email')}
      />

      <TextField
        id="login-password"
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••••••"
        error={errors.password?.message}
        disabled={isSubmitting}
        {...register('password')}
      />

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
        className="w-full justify-center text-base"
      >
        Sign in <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
