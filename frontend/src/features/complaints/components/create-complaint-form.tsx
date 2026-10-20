"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Upload,
  X,
  CircleAlert,
  LoaderCircle,
  FileImage,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/auth-context";
import {
  createComplaintSchema,
  type CreateComplaintFormData,
} from "../schemas";
import {
  getCategories,
  createComplaint,
  uploadAttachment,
  deleteAttachment,
} from "@/lib/api/complaints";
import type { CategoryItem, AttachmentItem } from "../types";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { SelectField } from "@/components/ui/select-field";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";

export function CreateComplaintForm() {
  const router = useRouter();
  const { user, apiClient, accessToken } = useAuth();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);

  // Staged attachments
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateComplaintFormData>({
    resolver: zodResolver(createComplaintSchema),
    defaultValues: {
      title: "",
      description: "",
      categoryId: "",
      location: {
        type: "ROOM",
        hostelId: user?.hostelId || "",
        blockId: user?.blockId || "",
        roomId: user?.roomId || "",
        areaLabel: "",
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: false,
        functionalityLoss: false,
      },
      attachmentIds: [],
    },
  });

  const locationType = useWatch({ control, name: "location.type" });

  // Load categories for student's hostel
  useEffect(() => {
    if (!user?.hostelId) return;
    let active = true;
    getCategories(apiClient, user.hostelId)
      .then((cats) => {
        if (active) {
          setCategories(cats.filter((c) => c.isActive));
          setLoadingCategories(false);
        }
      })
      .catch(() => {
        if (active) setLoadingCategories(false);
      });
    return () => {
      active = false;
    };
  }, [user?.hostelId, apiClient]);

  // Adjust location fields based on type
  useEffect(() => {
    if (user?.hostelId) {
      setValue("location.hostelId", user.hostelId);
    }
    if (locationType === "ROOM") {
      setValue("location.blockId", user?.blockId || "");
      setValue("location.roomId", user?.roomId || "");
      setValue("location.areaLabel", "");
    } else if (locationType === "BLOCK_COMMON") {
      setValue("location.blockId", user?.blockId || "");
      setValue("location.roomId", "");
    } else {
      setValue("location.blockId", "");
      setValue("location.roomId", "");
    }
  }, [locationType, user, setValue]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length >= 3) {
      toast.error("Maximum 3 photos allowed per report.");
      return;
    }

    const file = files[0];
    if (!file) return;

    // Check client-side limit
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size cannot exceed 5MB.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const uploaded = await uploadAttachment(apiClient, file, accessToken);
      const newAttachments = [...attachments, uploaded];
      setAttachments(newAttachments);
      setValue(
        "attachmentIds",
        newAttachments.map((a) => a.id)
      );
      toast.success("Photo attached");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload photo"
      );
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = async (attachmentId: string) => {
    try {
      await deleteAttachment(apiClient, attachmentId);
    } catch {
      // Ignore network error on delete
    }
    const filtered = attachments.filter((a) => a.id !== attachmentId);
    setAttachments(filtered);
    setValue(
      "attachmentIds",
      filtered.map((a) => a.id)
    );
  };

  const onSubmit = async (data: CreateComplaintFormData) => {
    setServerError(null);
    try {
      const clientRequestId = crypto.randomUUID();
      const created = await createComplaint(apiClient, {
        ...data,
        attachmentIds: attachments.map((a) => a.id),
        clientRequestId,
      });

      toast.success("Complaint submitted successfully!", {
        description: `Reference #${created.reference}`,
      });
      router.push(`/complaints/${created.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.fields && err.fields.length > 0) {
          for (const field of err.fields) {
            const path = field.path as keyof CreateComplaintFormData;
            if (path) setError(path, { message: field.message });
          }
        }
        setServerError(err.message);
      } else {
        setServerError("Failed to submit complaint. Please check your connection.");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>{serverError}</p>
        </div>
      )}

      {/* Basic Info */}
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-base font-semibold text-ink">1. Issue details</h2>

        <TextField
          id="complaint-title"
          label="Complaint title"
          placeholder="e.g. Ceiling fan bearing noise and low speed"
          hint="Summarize the repair in 8 to 120 characters"
          error={errors.title?.message}
          disabled={isSubmitting}
          {...register("title")}
        />

        <SelectField
          id="complaint-category"
          label="Category"
          placeholder={loadingCategories ? "Loading categories..." : "Select repair category"}
          error={errors.categoryId?.message}
          disabled={isSubmitting || loadingCategories}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          {...register("categoryId")}
        />

        <TextareaField
          id="complaint-description"
          label="Detailed description"
          rows={4}
          placeholder="Describe what happened, where in the room it is located, and how long it has been an issue..."
          hint="At least 20 characters explaining the issue context"
          error={errors.description?.message}
          disabled={isSubmitting}
          {...register("description")}
        />
      </div>

      {/* Location */}
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-base font-semibold text-ink">2. Location</h2>

        <SelectField
          id="location-type"
          label="Where is the issue?"
          error={errors.location?.type?.message}
          disabled={isSubmitting}
          options={[
            { value: "ROOM", label: "My Assigned Room" },
            { value: "BLOCK_COMMON", label: "My Block Shared Area (Corridor, Washroom)" },
            { value: "HOSTEL_COMMON", label: "Hostel Common Facility (Mess, Entrance, Lawn)" },
          ]}
          {...register("location.type")}
        />

        {locationType === "ROOM" && (
          <div className="rounded-xl border border-line bg-canvas/70 p-4 text-xs text-muted">
            <p>
              This report will be linked to your allocated room:{" "}
              <strong>Room {user?.roomId || "Assigned"}</strong>.
            </p>
          </div>
        )}

        {locationType === "BLOCK_COMMON" && (
          <TextField
            id="location-block-area"
            label="Specific common area"
            placeholder="e.g. 2nd floor west washroom"
            hint="Describe which area of your block is affected"
            error={errors.location?.areaLabel?.message}
            disabled={isSubmitting}
            {...register("location.areaLabel")}
          />
        )}

        {locationType === "HOSTEL_COMMON" && (
          <TextField
            id="location-hostel-area"
            label="Specific hostel facility"
            placeholder="e.g. Main dining hall water cooler"
            hint="Describe the specific facility or shared space"
            error={errors.location?.areaLabel?.message}
            disabled={isSubmitting}
            {...register("location.areaLabel")}
          />
        )}
      </div>

      {/* Priority Indicators */}
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        <div>
          <h2 className="text-base font-semibold text-ink">3. Severity indicators</h2>
          <p className="text-xs text-muted mt-1">
            Check any conditions that apply. The system uses these to suggest appropriate urgency.
          </p>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 hover:bg-canvas/50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded text-brand focus:ring-brand"
              disabled={isSubmitting}
              {...register("indicators.safetyRisk")}
            />
            <div>
              <p className="text-sm font-medium text-ink">Safety hazard</p>
              <p className="text-xs text-muted">
                Exposed wires, broken glass, sparking switch, or hazardous condition
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-line p-3 hover:bg-canvas/50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded text-brand focus:ring-brand"
              disabled={isSubmitting}
              {...register("indicators.essentialServiceOutage")}
            />
            <div>
              <p className="text-sm font-medium text-ink">Essential service outage</p>
              <p className="text-xs text-muted">
                Total loss of water supply, electricity outage, or toilet blockage
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-line p-3 hover:bg-canvas/50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded text-brand focus:ring-brand"
              disabled={isSubmitting}
              {...register("indicators.affectsMultipleRooms")}
            />
            <div>
              <p className="text-sm font-medium text-ink">Affects multiple rooms or residents</p>
              <p className="text-xs text-muted">
                Issue impacting a shared wing, corridor, or water line
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-line p-3 hover:bg-canvas/50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded text-brand focus:ring-brand"
              disabled={isSubmitting}
              {...register("indicators.functionalityLoss")}
            />
            <div>
              <p className="text-sm font-medium text-ink">Complete functionality loss</p>
              <p className="text-xs text-muted">
                The fixture, door lock, or appliance cannot be used at all
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Photos (Max 3) */}
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">4. Photos (optional)</h2>
            <p className="text-xs text-muted mt-1">
              Add up to 3 photos (JPEG, PNG, WebP up to 5MB each) to assist maintenance staff.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted">
            {attachments.length} / 3
          </span>
        </div>

        {attachments.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {attachments.map((photo) => (
              <div
                key={photo.id}
                className="relative flex items-center justify-between rounded-xl border border-line bg-canvas p-3"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileImage className="size-5 text-brand shrink-0" />
                  <span className="truncate text-xs font-medium text-ink">
                    {photo.originalName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="rounded-md p-1 text-muted hover:text-danger"
                  aria-label={`Remove photo ${photo.originalName}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachments.length < 3 && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoUpload}
              className="sr-only"
              id="photo-upload"
              disabled={isSubmitting || uploadingPhoto}
            />
            <label
              htmlFor="photo-upload"
              className="flex min-h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-canvas/40 px-4 text-xs font-semibold text-muted hover:bg-canvas hover:text-brand"
            >
              {uploadingPhoto ? (
                <>
                  <LoaderCircle className="size-4 animate-spin text-brand" />
                  <span>Uploading photo...</span>
                </>
              ) : (
                <>
                  <Upload className="size-4 text-brand" />
                  <span>Attach photo ({3 - attachments.length} remaining)</span>
                </>
              )}
            </label>
          </div>
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
        className="w-full justify-center text-base"
      >
        Submit maintenance report <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
