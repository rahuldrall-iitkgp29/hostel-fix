'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/features/auth/context/auth-context';
import { editComplaint } from '@/lib/api/complaints';
import { ApiError } from '@/lib/api/errors';
import { editComplaintSchema, type EditComplaintFormData } from '../schemas';
import type { ComplaintDetail } from '../types';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { Button } from '@/components/ui/button';

export function EditComplaintForm({
  complaint,
  onSaved,
  onConflict,
}: {
  complaint: ComplaintDetail;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const { apiClient } = useAuth();
  const [error, setErrorMessage] = useState<string | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditComplaintFormData>({
    resolver: zodResolver(editComplaintSchema),
    defaultValues: {
      expectedVersion: complaint.version,
      title: complaint.title,
      description: complaint.description,
    },
  });
  const save = async (data: EditComplaintFormData) => {
    setErrorMessage(null);
    try {
      await editComplaint(apiClient, complaint.id, data);
      onSaved();
    } catch (failure) {
      if (failure instanceof ApiError) {
        if (failure.status === 409) {
          setConflicted(true);
          setErrorMessage(
            'This complaint changed. Reload it and review your edits before saving.'
          );
        } else {
          setErrorMessage(failure.message);
          failure.fields?.forEach((field) => {
            if (field.path === 'title' || field.path === 'description')
              setError(field.path, { message: field.message });
          });
        }
      } else setErrorMessage('Unable to save your edits. Please try again.');
    }
  };
  return (
    <form onSubmit={handleSubmit(save)} className="space-y-4" noValidate>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <TextField
        id="edit-title"
        label="Complaint title"
        error={errors.title?.message}
        disabled={isSubmitting}
        {...register('title')}
      />
      <TextareaField
        id="edit-description"
        label="Description"
        error={errors.description?.message}
        disabled={isSubmitting}
        {...register('description')}
      />
      {conflicted ? (
        <Button type="button" onClick={onConflict}>
          Reload complaint
        </Button>
      ) : (
        <Button type="submit" loading={isSubmitting}>
          Save changes
        </Button>
      )}
    </form>
  );
}
